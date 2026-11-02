import { WORKSPACE_CONTAINER_TYPES } from './workspace-view.js'

/**
 * 工作区左栏分区 id。
 * 这里固定导航骨架，避免前端自己根据接口内容猜分区顺序。
 */
export const WORKSPACE_SIDEBAR_SECTION_IDS = {
    watchLater: 'watch_later',
    keyFolders: 'key_folders',
    folders: 'folders'
}

/**
 * 左栏分区顺序是产品决策的一部分。
 * 稍后再看池始终在最前面，方便把待处理入口前置。
 */
export const DEFAULT_WORKSPACE_SIDEBAR_SECTION_ORDER = [
    WORKSPACE_SIDEBAR_SECTION_IDS.watchLater,
    WORKSPACE_SIDEBAR_SECTION_IDS.keyFolders,
    WORKSPACE_SIDEBAR_SECTION_IDS.folders
]

/**
 * 稍后再看池尚未接入时，也保留一个稳定的 disabled 分区。
 * 这样前后续版本可以复用同一份 response shape。
 */
export function createSidebarSection(overrides = {}) {
    return {
        id: WORKSPACE_SIDEBAR_SECTION_IDS.folders,
        title: '',
        enabled: true,
        items: [],
        ...overrides
    }
}

/**
 * 左栏每一项都是工作区容器的轻量导航摘要，而不是完整容器详情。
 * 右栏真正渲染时，仍然要再走 container view 接口拿完整上下文。
 */
export function createSidebarContainerItem(overrides = {}) {
    return {
        id: null,
        type: WORKSPACE_CONTAINER_TYPES.folder,
        title: '',
        sourceFolderId: null,
        sourceFid: null,
        isKeyFolder: false,
        profileCompleted: false,
        itemCount: 0,
        pendingCount: 0,
        isEmpty: true,
        ...overrides
    }
}

/**
 * 工作区默认打开哪个容器，应该由服务端统一给出。
 * 这样 React 首屏不用再重复实现「稍后再看池优先」这套规则。
 */
export function createEmptyWorkspaceSidebar(overrides = {}) {
    return {
        defaultContainerId: null,
        sections: overrides.sections || [
            createSidebarSection({
                id: WORKSPACE_SIDEBAR_SECTION_IDS.watchLater,
                title: '稍后再看池',
                enabled: false
            }),
            createSidebarSection({
                id: WORKSPACE_SIDEBAR_SECTION_IDS.keyFolders,
                title: '关键收藏夹'
            }),
            createSidebarSection({
                id: WORKSPACE_SIDEBAR_SECTION_IDS.folders,
                title: '普通收藏夹'
            })
        ],
        ...overrides
    }
}
