/**
 * 当前后端的数据库 schema 草案。
 * 一期先按 SQLite 设计，并把“视频主记录”和“容器归属关系”分开，避免同一视频跨收藏夹时被当成多个收藏项。
 */
export const DATABASE_DIALECT = 'sqlite'

/**
 * 所有表名集中定义，避免后续 SQL 和查询模块散落硬编码。
 */
export const TABLES = {
    importRuns: 'import_runs',
    sourceFolders: 'source_folders',
    sourceItems: 'source_items',
    sourceFolderItems: 'source_folder_items',
    sourceWatchLaterItems: 'source_watch_later_items',
    keyFolders: 'key_folders',
    folderProfiles: 'folder_profiles',
    itemSuggestions: 'item_suggestions',
    itemDecisions: 'item_decisions',
    itemSyncStatus: 'item_sync_status',
    watchLaterState: 'watch_later_state'
}

/**
 * 统一收口一期用到的状态枚举，避免路由层和业务层各自拼字面量。
 */
export const ENUMS = {
    importStatus: ['running', 'completed', 'failed'],
    suggestionDecisionStatus: ['pending', 'confirmed', 'deferred'],
    syncStatus: ['not_synced', 'synced', 'sync_failed'],
    watchLaterStatus: ['pending', 'transferred', 'deferred'],
    suggestionGeneratedBy: ['rules', 'hybrid', 'ai'],
    suggestionContextType: ['folder', 'watch_later']
}

/**
 * 这份定义给人读，也给后续 migration 生成器用。
 * 核心边界是：`source_items` 表示视频主记录，归属关系放进 membership 表。
 */
export const SCHEMA = {
    [TABLES.importRuns]: {
        purpose: '记录一次完整导入任务及其结果',
        columns: {
            id: 'TEXT PRIMARY KEY',
            source_type: "TEXT NOT NULL DEFAULT 'bilibili'",
            source_mid: 'TEXT NOT NULL',
            status: "TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed'))",
            started_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            finished_at: 'TEXT',
            folder_count: 'INTEGER NOT NULL DEFAULT 0',
            item_count: 'INTEGER NOT NULL DEFAULT 0',
            error_message: 'TEXT',
            created_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        },
        indexes: ['CREATE INDEX IF NOT EXISTS idx_import_runs_source_mid ON import_runs(source_mid)']
    },

    [TABLES.sourceFolders]: {
        purpose: '记录平台收藏夹本体',
        columns: {
            id: 'TEXT PRIMARY KEY',
            source_type: "TEXT NOT NULL DEFAULT 'bilibili'",
            source_mid: 'TEXT NOT NULL',
            source_folder_id: 'TEXT NOT NULL',
            source_fid: 'TEXT',
            title: 'TEXT NOT NULL',
            media_count: 'INTEGER NOT NULL DEFAULT 0',
            attr: 'INTEGER',
            sort_order: 'INTEGER', // 平台返回列表里的下标，仅用于左栏排序，不参与业务判断
            latest_import_run_id: 'TEXT REFERENCES import_runs(id)',
            raw_json: 'TEXT',
            created_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            updated_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        },
        constraints: [
            'UNIQUE (source_type, source_mid, source_folder_id)'
        ],
        indexes: [
            'CREATE INDEX IF NOT EXISTS idx_source_folders_mid ON source_folders(source_mid)',
            'CREATE INDEX IF NOT EXISTS idx_source_folders_title ON source_folders(title)'
        ]
    },

    [TABLES.sourceItems]: {
        purpose: '记录 canonical 视频主记录，同一视频跨收藏夹仍只保留一条',
        columns: {
            id: 'TEXT PRIMARY KEY',
            source_type: "TEXT NOT NULL DEFAULT 'bilibili'",
            source_video_id: 'TEXT NOT NULL',
            source_bvid: 'TEXT',
            title: 'TEXT NOT NULL',
            intro: 'TEXT',
            duration_seconds: 'INTEGER NOT NULL DEFAULT 0',
            cover_url: 'TEXT',
            upper_name: 'TEXT',
            upper_mid: 'TEXT',
            publish_time: 'TEXT',
            raw_json: 'TEXT',
            created_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            updated_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        },
        constraints: [
            'UNIQUE (source_type, source_video_id)'
        ],
        indexes: [
            'CREATE INDEX IF NOT EXISTS idx_source_items_bvid ON source_items(source_bvid)',
            'CREATE INDEX IF NOT EXISTS idx_source_items_title ON source_items(title)'
        ]
    },

    [TABLES.sourceFolderItems]: {
        purpose: '记录视频与收藏夹的归属关系及收藏时间',
        columns: {
            id: 'TEXT PRIMARY KEY',
            folder_id: 'TEXT NOT NULL REFERENCES source_folders(id)',
            item_id: 'TEXT NOT NULL REFERENCES source_items(id)',
            first_seen_import_run_id: 'TEXT REFERENCES import_runs(id)',
            last_seen_import_run_id: 'TEXT REFERENCES import_runs(id)',
            source_fav_time: 'TEXT',
            is_active: 'INTEGER NOT NULL DEFAULT 1',
            raw_json: 'TEXT',
            created_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            updated_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        },
        constraints: [
            'UNIQUE (folder_id, item_id)'
        ],
        indexes: [
            'CREATE INDEX IF NOT EXISTS idx_source_folder_items_folder ON source_folder_items(folder_id)',
            'CREATE INDEX IF NOT EXISTS idx_source_folder_items_item ON source_folder_items(item_id)',
            'CREATE INDEX IF NOT EXISTS idx_source_folder_items_active ON source_folder_items(is_active)'
        ]
    },

    [TABLES.sourceWatchLaterItems]: {
        purpose: '记录视频是否属于稍后再看池及其来源时间',
        columns: {
            id: 'TEXT PRIMARY KEY',
            item_id: 'TEXT NOT NULL REFERENCES source_items(id)',
            first_seen_import_run_id: 'TEXT REFERENCES import_runs(id)',
            last_seen_import_run_id: 'TEXT REFERENCES import_runs(id)',
            source_added_at: 'TEXT',
            is_active: 'INTEGER NOT NULL DEFAULT 1',
            raw_json: 'TEXT',
            created_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            updated_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        },
        constraints: [
            'UNIQUE (item_id)'
        ],
        indexes: [
            'CREATE INDEX IF NOT EXISTS idx_source_watch_later_items_active ON source_watch_later_items(is_active)'
        ]
    },

    [TABLES.keyFolders]: {
        purpose: '记录哪些收藏夹被用户标记为关键收藏夹',
        columns: {
            folder_id: 'TEXT PRIMARY KEY REFERENCES source_folders(id)',
            marked_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            created_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            updated_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        },
        indexes: []
    },

    [TABLES.folderProfiles]: {
        purpose: '记录关键收藏夹的半结构化说明',
        columns: {
            folder_id: 'TEXT PRIMARY KEY REFERENCES source_folders(id)',
            include_topics: 'TEXT NOT NULL',
            exclude_topics: 'TEXT',
            keywords_json: "TEXT NOT NULL DEFAULT '[]'",
            purpose: 'TEXT NOT NULL',
            notes: 'TEXT',
            completed_at: 'TEXT',
            created_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            updated_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        },
        indexes: []
    },

    [TABLES.itemSuggestions]: {
        purpose: '记录某次建议生成出的多个候选结果',
        columns: {
            id: 'TEXT PRIMARY KEY',
            suggestion_group_id: 'TEXT NOT NULL',
            item_id: 'TEXT NOT NULL REFERENCES source_items(id)',
            context_type: "TEXT NOT NULL CHECK (context_type IN ('folder', 'watch_later'))",
            context_folder_id: 'TEXT REFERENCES source_folders(id)',
            candidate_folder_id: 'TEXT NOT NULL REFERENCES source_folders(id)',
            rank: 'INTEGER NOT NULL',
            reason: 'TEXT NOT NULL',
            evidence_tags_json: "TEXT NOT NULL DEFAULT '[]'",
            generated_by: "TEXT NOT NULL CHECK (generated_by IN ('rules', 'hybrid', 'ai'))",
            generated_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        },
        constraints: [
            'UNIQUE (suggestion_group_id, rank)'
        ],
        indexes: [
            'CREATE INDEX IF NOT EXISTS idx_item_suggestions_item ON item_suggestions(item_id)',
            'CREATE INDEX IF NOT EXISTS idx_item_suggestions_group ON item_suggestions(suggestion_group_id)'
        ]
    },

    [TABLES.itemDecisions]: {
        purpose: '记录每个收藏项当前的确认状态，一期先按单当前决定处理',
        columns: {
            item_id: 'TEXT PRIMARY KEY REFERENCES source_items(id)',
            status: "TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'deferred'))",
            chosen_folder_id: 'TEXT REFERENCES source_folders(id)',
            source_suggestion_group_id: 'TEXT',
            decided_at: 'TEXT',
            note: 'TEXT',
            created_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            updated_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        },
        indexes: [
            'CREATE INDEX IF NOT EXISTS idx_item_decisions_status ON item_decisions(status)'
        ]
    },

    [TABLES.itemSyncStatus]: {
        purpose: '为二期写回平台预留同步状态',
        columns: {
            item_id: 'TEXT PRIMARY KEY REFERENCES source_items(id)',
            status: "TEXT NOT NULL CHECK (status IN ('not_synced', 'synced', 'sync_failed'))",
            target_folder_id: 'TEXT REFERENCES source_folders(id)',
            last_attempted_at: 'TEXT',
            last_synced_at: 'TEXT',
            error_message: 'TEXT',
            created_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            updated_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        },
        indexes: [
            'CREATE INDEX IF NOT EXISTS idx_item_sync_status_status ON item_sync_status(status)'
        ]
    },

    [TABLES.watchLaterState]: {
        purpose: '记录稍后再看池的本地处理状态',
        columns: {
            item_id: 'TEXT PRIMARY KEY REFERENCES source_items(id)',
            status: "TEXT NOT NULL CHECK (status IN ('pending', 'transferred', 'deferred'))",
            target_folder_id: 'TEXT REFERENCES source_folders(id)',
            processed_at: 'TEXT',
            created_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            updated_at: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        },
        indexes: [
            'CREATE INDEX IF NOT EXISTS idx_watch_later_state_status ON watch_later_state(status)'
        ]
    }
}

function buildCreateTableSql(tableName, tableDefinition) {
    const columnEntries = Object.entries(tableDefinition.columns).map(([columnName, sql]) => `    ${columnName} ${sql}`)
    const constraintEntries = (tableDefinition.constraints || []).map((sql) => `    ${sql}`)
    return [
        `CREATE TABLE IF NOT EXISTS ${tableName} (`,
        [...columnEntries, ...constraintEntries].join(',\n'),
        ');'
    ].join('\n')
}

/**
 * 统一导出建表语句，后续 migration runner 只需要顺序执行即可。
 */
export const SQLITE_SCHEMA_STATEMENTS = Object.entries(SCHEMA).flatMap(([tableName, tableDefinition]) => {
    return [
        buildCreateTableSql(tableName, tableDefinition),
        ...(tableDefinition.indexes || [])
    ]
})
