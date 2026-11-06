/**
 * 前端侧的接口 view model。
 * 这些类型只描述「后端已经算好的可渲染结果」，刻意不复刻数据库字段，
 * 对应文档：docs/workspace-sidebar-contract.md、docs/workspace-view-response.md、
 * docs/key-folders-contract.md、docs/folder-profile-contract.md。
 */

/** 容器类型：一期只有普通收藏夹与稍后再看池。 */
export type ContainerType = 'folder' | 'watch_later'

/** 左栏分区 id，顺序由后端固定。 */
export type SidebarSectionId = 'watch_later' | 'key_folders' | 'folders'

export type SidebarItem = {
    id: string
    type: ContainerType
    title: string
    sourceFolderId: string | null
    sourceFid: string | null
    isKeyFolder: boolean
    profileCompleted: boolean
    itemCount: number
    pendingCount: number
    isEmpty: boolean
}

export type SidebarSection = {
    id: SidebarSectionId
    title: string
    enabled: boolean
    items: SidebarItem[]
}

export type WorkspaceSidebar = {
    defaultContainerId: string | null
    sections: SidebarSection[]
}

export type FolderProfileInput = {
    includeTopics: string
    excludeTopics: string
    keywords: string[]
    purpose: string
    notes: string
}

export type WorkspaceContainer = {
    id: string
    type: ContainerType
    title: string
    sourceFolderId: string | null
    sourceFid: string | null
    isKeyFolder: boolean
    profileCompleted: boolean
    /** 只有关键收藏夹且已录过说明时才有值。 */
    description: FolderProfileInput | null
}

export type WorkspaceStats = {
    totalItems: number
    pendingDecisionCount: number
    confirmedCount: number
    deferredCount: number
    suggestionCoverageCount: number
    activeSourceCount: number
}

export type WorkspaceFilters = {
    page: number
    pageSize: number
    keyword: string
    sortBy: string
    sortOrder: string
}

export type Pagination = {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
}

export type DecisionStatus = 'pending' | 'confirmed' | 'deferred'

export type SuggestionTopCandidate = {
    folderId: string
    folderTitle: string
    reason: string
    evidenceTags: string[]
}

export type WorkspaceViewItem = {
    id: string
    sourceVideoId: string
    sourceBvid: string
    title: string
    intro: string
    durationSeconds: number
    /** 后端已格式化好的时长，表格直接展示。 */
    durationLabel: string
    /** 展示格式 `YYYY-MM-DD HH:mm:ss`，空值或非法时间为 null。 */
    publishTime: string | null
    favTime: string | null
    upper: { name: string | null; mid: string | null }
    sourceContext: { containerType: ContainerType; containerId: string | null; containerTitle: string }
    decision: {
        status: DecisionStatus
        chosenFolderId: string | null
        chosenFolderTitle: string | null
        updatedAt: string | null
    }
    suggestionSummary: {
        hasSuggestions: boolean
        latestSuggestionGroupId: string | null
        candidateCount: number
        topCandidate: SuggestionTopCandidate | null
    }
    sync: { status: string; targetFolderId: string | null; lastAttemptedAt: string | null }
    /** folder 容器下恒为占位对象，字段值为 null。 */
    watchLater: { status: string | null; processedAt: string | null }
}

export type WorkspaceView = {
    container: WorkspaceContainer
    stats: WorkspaceStats
    filters: WorkspaceFilters
    list: { items: WorkspaceViewItem[]; pagination: Pagination }
}

export type SetKeyFoldersResult = {
    keyFolderIds: string[]
    count: number
    updatedAt: string | null
}

export type SaveFolderProfileResult = {
    folderId: string
    profile: FolderProfileInput & { profileCompleted: boolean; completedAt: string | null; updatedAt: string | null }
}
