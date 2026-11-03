import { DEFAULT_BILI_MID } from '../config/env.js'
import { getDatabase, migrateDatabase } from '../adapters/db/sqlite.js'
import { TABLES } from '../adapters/db/schema.js'
import { ITEM_DECISION_STATUS } from '../domain/item-decision.js'
import { WORKSPACE_CONTAINER_TYPES } from '../domain/workspace-view.js'
import {
    createEmptyWorkspaceSidebar,
    createSidebarContainerItem,
    createSidebarSection,
    WORKSPACE_SIDEBAR_SECTION_IDS
} from '../domain/workspace-sidebar.js'

/**
 * 工作区左栏的唯一数据来源。
 * 一次查完收藏夹、关键标记、说明完成态与条目计数，
 * 让前端不用再打多次接口自己拼分区和默认选中项。
 */
export async function getWorkspaceSidebar({ mid = DEFAULT_BILI_MID } = {}) {
    migrateDatabase()

    const folderItems = listFolderRows(mid).map(mapFolderRowToSidebarItem)
    const keyFolderItems = folderItems.filter((item) => item.isKeyFolder)
    const normalFolderItems = folderItems.filter((item) => !item.isKeyFolder)

    return createEmptyWorkspaceSidebar({
        sections: [
            // 一期导入还不覆盖稍后再看池，这里先给出稳定分区但标记为不可用。
            createSidebarSection({
                id: WORKSPACE_SIDEBAR_SECTION_IDS.watchLater,
                title: '稍后再看池',
                enabled: false,
                items: []
            }),
            createSidebarSection({
                id: WORKSPACE_SIDEBAR_SECTION_IDS.keyFolders,
                title: '关键收藏夹',
                items: keyFolderItems
            }),
            createSidebarSection({
                id: WORKSPACE_SIDEBAR_SECTION_IDS.folders,
                title: '普通收藏夹',
                items: normalFolderItems
            })
        ],
        defaultContainerId: resolveDefaultContainerId(keyFolderItems, normalFolderItems)
    })
}

/**
 * 左栏只需要「可见条目数」和「待处理数」，所以聚合直接在这条查询里算好，
 * 避免把 source_folder_items × item_decisions 的 join 细节漏到路由层。
 * 一级排序用 created_at、二级用 rowid，保证同一次导入内的顺序稳定。
 */
function listFolderRows(mid) {
    return getDatabase().prepare(`
        SELECT
            f.id,
            f.source_folder_id,
            f.source_fid,
            f.title,
            CASE WHEN k.folder_id IS NULL THEN 0 ELSE 1 END AS is_key_folder,
            p.completed_at,
            COUNT(sfi.id) AS item_count,
            SUM(
                CASE
                    WHEN sfi.id IS NOT NULL
                        AND (d.status IS NULL OR d.status = $pendingStatus)
                    THEN 1
                    ELSE 0
                END
            ) AS pending_count
        FROM ${TABLES.sourceFolders} AS f
        LEFT JOIN ${TABLES.keyFolders} AS k ON k.folder_id = f.id
        LEFT JOIN ${TABLES.folderProfiles} AS p ON p.folder_id = f.id
        LEFT JOIN ${TABLES.sourceFolderItems} AS sfi
            ON sfi.folder_id = f.id AND sfi.is_active = 1
        LEFT JOIN ${TABLES.itemDecisions} AS d ON d.item_id = sfi.item_id
        WHERE f.source_mid = $sourceMid
        GROUP BY f.id
        ORDER BY f.created_at ASC, f.rowid ASC
    `).all({
        sourceMid: mid,
        pendingStatus: ITEM_DECISION_STATUS.pending
    })
}

function mapFolderRowToSidebarItem(row) {
    const itemCount = Number(row.item_count) || 0

    return createSidebarContainerItem({
        id: row.id,
        type: WORKSPACE_CONTAINER_TYPES.folder,
        title: row.title,
        sourceFolderId: row.source_folder_id,
        sourceFid: row.source_fid,
        isKeyFolder: Boolean(row.is_key_folder),
        // 完成态直接认服务端记录的 completed_at，避免各处重新推导说明是否填齐。
        profileCompleted: Boolean(row.completed_at),
        itemCount,
        pendingCount: Number(row.pending_count) || 0,
        isEmpty: itemCount === 0
    })
}

/**
 * 默认选中规则固化在服务端，前端不必再实现「待处理入口优先」这套判断。
 * 一期稍后再看池不可用，所以只在关键收藏夹和普通收藏夹之间取值。
 */
function resolveDefaultContainerId(keyFolderItems, normalFolderItems) {
    const firstAvailableItem = keyFolderItems[0] || normalFolderItems[0]
    return firstAvailableItem ? firstAvailableItem.id : null
}
