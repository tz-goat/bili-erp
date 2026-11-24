import { useState } from 'react'
import {
    Alert,
    Button,
    Card,
    Descriptions,
    Empty,
    Input,
    message,
    Pagination,
    Popconfirm,
    Space,
    Table,
    Tag,
    Typography
} from 'antd'
import type { TableProps } from 'antd'
import type { CSSProperties } from 'react'

import { confirmItemDecision, generateItemSuggestions } from '../../api/items'
import { setKeyFolders } from '../../api/key-folders'
import type {
    DecisionStatus,
    SidebarItem,
    SuggestionCandidate,
    SuggestionResult,
    WorkspaceSortBy,
    WorkspaceSortOrder,
    WorkspaceViewItem
} from '../../api/types'
import { FolderProfileEditModal } from './FolderProfileEditModal'
import { ItemSuggestionModal } from './ItemSuggestionModal'
import { useWorkspaceView } from './useWorkspaceView'

const emptyStyle = { marginTop: 80 }
const titleStyle = { marginTop: 0 }
const metaStyle = { marginBottom: 16 }
/** 容器级统计行：与头部身份标签同为区域信息，用紧凑排版避免撑高 ERP 版式。 */
const statsStyle: CSSProperties = { marginBottom: 16 }
const paginationStyle: CSSProperties = { marginTop: 16, textAlign: 'right' }
/** 简介两行截断：长文本会把行高撑开，破坏 ERP 表格的扫读节奏（项目硬约束）。 */
const introStyle: CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden'
}

type SortOrder = 'ascend' | 'descend' | null

/** null = 无排序态（列头无箭头），与 antd 第三态「取消排序」一致；请求仍可不带 sort，由后端回落默认序。 */
type SortState = {
    sortBy: WorkspaceSortBy
    sortOrder: WorkspaceSortOrder
} | null

/** 可排序列的 key → 后端排序白名单值；不在表里的列不参与服务端排序。 */
const SORT_BY_COLUMN_KEY: Record<string, WorkspaceSortBy> = {
    duration: 'duration',
    publishTime: 'publish_time',
    favTime: 'fav_time'
}

const DECISION_LABEL: Record<DecisionStatus, string> = {
    pending: '待确认',
    confirmed: '已确认'
}

const DECISION_COLOR: Record<DecisionStatus, string> = {
    pending: 'default',
    confirmed: 'green'
}

type ColumnActions = {
    busyItemId: string | null
    onGenerate: (item: WorkspaceViewItem) => void
}

/**
 * 列对齐旧原型 folder_detail.ejs，去掉本地库未存的三方计数（播放 / 收藏 / 弹幕）。
 * 三列排序一律走服务端：这里只声明 sorter: true 并受控 sortOrder，
 * 不给比较函数——那只会排当前这一页，且时长按 MM:SS 文本比较也不是数值序。
 * 关键收藏夹是归位目标，不在本夹内做整理操作，故隐藏整理状态 / 建议摘要 / 操作。
 */
function createColumns(
    sort: SortState,
    actions: ColumnActions,
    options: { showOrganizeColumns: boolean }
): TableProps<WorkspaceViewItem>['columns'] {
    const resolveSortOrder = (key: WorkspaceSortBy): SortOrder => {
        if (!sort || sort.sortBy !== key) {
            return null
        }

        return sort.sortOrder === 'asc' ? 'ascend' : 'descend'
    }

    const columns: TableProps<WorkspaceViewItem>['columns'] = [
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            width: 280,
            render: (_, item) => (
                <Typography.Link
                    href={`https://www.bilibili.com/video/${item.sourceBvid}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    {item.title}
                </Typography.Link>
            )
        },
        { title: '作者', key: 'upper', width: 120, render: (_, item) => item.upper.name ?? '-' },
        {
            title: '时长',
            dataIndex: 'durationLabel',
            key: 'duration',
            width: 80,
            sorter: true,
            sortOrder: resolveSortOrder('duration')
        },
        {
            title: '发布时间',
            dataIndex: 'publishTime',
            key: 'publishTime',
            width: 160,
            sorter: true,
            sortOrder: resolveSortOrder('publish_time'),
            render: (value: string | null) => value ?? '-'
        },
        {
            title: '收藏时间',
            dataIndex: 'favTime',
            key: 'favTime',
            width: 160,
            sorter: true,
            sortOrder: resolveSortOrder('fav_time'),
            render: (value: string | null) => value ?? '-'
        },
        {
            title: '简介',
            dataIndex: 'intro',
            key: 'intro',
            width: 240,
            render: (intro: string) => (
                <span style={introStyle} title={intro}>
                    {intro || '-'}
                </span>
            )
        }
    ]

    if (!options.showOrganizeColumns) {
        return columns
    }

    return [
        ...columns,
        {
            title: '整理状态',
            key: 'decision',
            width: 140,
            render: (_, item) => (
                <Space direction="vertical" size={0}>
                    <Tag color={DECISION_COLOR[item.decision.status]}>{DECISION_LABEL[item.decision.status]}</Tag>
                    {item.decision.status === 'confirmed' && item.decision.chosenFolderTitle && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            → {item.decision.chosenFolderTitle}
                        </Typography.Text>
                    )}
                </Space>
            )
        },
        {
            title: '建议摘要',
            key: 'suggestion',
            width: 180,
            render: (_, item) => {
                if (!item.suggestionSummary.hasSuggestions || !item.suggestionSummary.topCandidate) {
                    return <Typography.Text type="secondary">未生成</Typography.Text>
                }

                const top = item.suggestionSummary.topCandidate
                return (
                    <Typography.Text title={top.reason}>
                        {top.folderTitle}
                        {item.suggestionSummary.candidateCount > 1
                            ? ` 等 ${item.suggestionSummary.candidateCount} 个`
                            : ''}
                    </Typography.Text>
                )
            }
        },
        {
            title: '操作',
            key: 'actions',
            fixed: 'right',
            width: 100,
            render: (_, item) => (
                <Button
                    type="link"
                    size="small"
                    loading={actions.busyItemId === item.id}
                    onClick={() => actions.onGenerate(item)}
                >
                    生成建议
                </Button>
            )
        }
    ]
}

type WorkspaceDetailProps = {
    container: SidebarItem | null
    keyFolderIds: string[]
    onSidebarReload: () => void
}

/**
 * 工作区右栏。
 * 头部身份标签取自左栏已加载的 sidebar item（零额外请求），容器级统计与收藏项表格由 container view 接口拉取；
 * 二者都以「当前容器」为准，所以切换容器时由父级用 key 重挂载，分页与排序状态自然回到该容器的初始态。
 */
export function WorkspaceDetail({ container, keyFolderIds, onSidebarReload }: WorkspaceDetailProps) {
    const [page, setPage] = useState(1)
    const [keywordInput, setKeywordInput] = useState('')
    const [keyword, setKeyword] = useState('')
    const [sort, setSort] = useState<SortState>(null)
    const [profileOpen, setProfileOpen] = useState(false)
    const [marking, setMarking] = useState(false)
    const [busyItemId, setBusyItemId] = useState<string | null>(null)
    const [suggestionModal, setSuggestionModal] = useState<{
        item: WorkspaceViewItem
        result: SuggestionResult
    } | null>(null)
    const [confirmingFolderId, setConfirmingFolderId] = useState<string | null>(null)

    const { view, loading, error, reload } = useWorkspaceView(container?.id ?? null, {
        page,
        keyword,
        sortBy: sort?.sortBy,
        sortOrder: sort?.sortOrder
    })

    if (!container) {
        return <Empty style={emptyStyle} description="请从左侧选择一个容器" />
    }

    const viewContainer = view?.container
    const profileCompleted = viewContainer?.profileCompleted ?? container.profileCompleted
    // 关键标记以左栏为准：升格后 sidebar 先刷新，view 里的 isKeyFolder 还是旧值
    const isKeyFolder = container.isKeyFolder
    const description = viewContainer?.description
    const canUnmark = keyFolderIds.length > 1
    const pagination = view?.list.pagination

    const handleTableChange: TableProps<WorkspaceViewItem>['onChange'] = (_pagination, _filters, sorter) => {
        const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter
        const nextSortBy = SORT_BY_COLUMN_KEY[String(activeSorter?.columnKey)]

        // 与 antd 一致：升序 → 降序 → 取消（无状态）。取消时不回落成默认倒序箭头。
        if (!nextSortBy || !activeSorter?.order) {
            setSort(null)
        } else {
            setSort({ sortBy: nextSortBy, sortOrder: activeSorter.order === 'ascend' ? 'asc' : 'desc' })
        }

        setPage(1)
    }

    const handleMarkKeyFolder = async () => {
        setMarking(true)
        try {
            await setKeyFolders([...keyFolderIds, container.id])
            onSidebarReload()
            reload()
            setProfileOpen(true)
            message.success('已标为关键收藏夹，可草拟或手改匹配词表')
        } catch (err) {
            message.error(err instanceof Error ? err.message : '标为关键收藏夹失败')
        } finally {
            setMarking(false)
        }
    }

    const handleUnmarkKeyFolder = async () => {
        setMarking(true)
        try {
            await setKeyFolders(keyFolderIds.filter((folderId) => folderId !== container.id))
            setProfileOpen(false)
            onSidebarReload()
            reload()
            message.success('已取消关键收藏夹，已有说明仍保留')
        } catch (err) {
            message.error(err instanceof Error ? err.message : '取消关键收藏夹失败')
        } finally {
            setMarking(false)
        }
    }

    const handleGenerate = async (item: WorkspaceViewItem) => {
        setBusyItemId(item.id)
        try {
            const result = await generateItemSuggestions(item.id, {
                contextContainerId: container.id,
                contextType: 'folder'
            })
            setSuggestionModal({ item, result })
            reload()
        } catch (err) {
            message.error(err instanceof Error ? err.message : '生成建议失败')
        } finally {
            setBusyItemId(null)
        }
    }

    const handleConfirmCandidate = async (candidate: SuggestionCandidate) => {
        if (!suggestionModal) {
            return
        }

        setConfirmingFolderId(candidate.folderId)
        try {
            await confirmItemDecision(suggestionModal.item.id, {
                chosenFolderId: candidate.folderId,
                sourceSuggestionGroupId: suggestionModal.result.suggestionGroupId
            })
            message.success(`已采用：归入「${candidate.folderTitle}」`)
            setSuggestionModal(null)
            reload()
        } catch (err) {
            message.error(err instanceof Error ? err.message : '采用失败')
        } finally {
            setConfirmingFolderId(null)
        }
    }

    return (
        <>
            <Space align="start" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
                <Typography.Title level={3} style={titleStyle}>
                    {container.title}
                </Typography.Title>
                <Space size={8}>
                    {isKeyFolder ? (
                        <>
                            <Button size="small" onClick={() => setProfileOpen(true)}>
                                编辑说明
                            </Button>
                            <Popconfirm
                                title="确定取消关键收藏夹？已填写的说明会保留。"
                                okText="确定取消"
                                cancelText="取消"
                                disabled={!canUnmark || marking}
                                onConfirm={handleUnmarkKeyFolder}
                            >
                                <Button size="small" danger disabled={!canUnmark || marking} loading={marking}>
                                    取消关键
                                </Button>
                            </Popconfirm>
                        </>
                    ) : container.type === 'folder' ? (
                        <Button size="small" type="primary" loading={marking} onClick={handleMarkKeyFolder}>
                            标为关键收藏夹
                        </Button>
                    ) : null}
                </Space>
            </Space>
            {isKeyFolder && (
                <Descriptions
                    size="small"
                    column={1}
                    style={statsStyle}
                    items={[
                        { key: 'purpose', label: '用途', children: description?.purpose || '未填写' },
                        { key: 'include', label: '纳入主题', children: description?.includeTopics || '未填写' },
                        { key: 'exclude', label: '排除主题', children: description?.excludeTopics || '未填写' }
                    ]}
                />
            )}
            <Space style={metaStyle} size={8} wrap>
                <Tag color="blue">{container.type}</Tag>
                {isKeyFolder && <Tag color="geekblue">关键收藏夹</Tag>}
                <Tag color={profileCompleted ? 'green' : 'default'}>
                    {profileCompleted ? '说明已完成' : '说明未完成'}
                </Tag>
                {container.sourceFolderId && (
                    <Typography.Text type="secondary">来源 ID：{container.sourceFolderId}</Typography.Text>
                )}
            </Space>
            {view && (
                <Space size={16} wrap style={statsStyle}>
                    <Typography.Text type="secondary">收藏项 {view.stats.totalItems}</Typography.Text>
                    <Typography.Text type="secondary">待确认 {view.stats.pendingDecisionCount}</Typography.Text>
                    <Typography.Text type="secondary">已确认 {view.stats.confirmedCount}</Typography.Text>
                    <Typography.Text type="secondary">已生成建议 {view.stats.suggestionCoverageCount}</Typography.Text>
                </Space>
            )}
            <Card
                title="收藏项"
                extra={
                    <Input.Search
                        allowClear
                        placeholder="搜索标题或 UP 主"
                        style={{ width: 240 }}
                        value={keywordInput}
                        onChange={(event) => {
                            const next = event.target.value
                            setKeywordInput(next)
                            if (next === '') {
                                setKeyword('')
                                setPage(1)
                            }
                        }}
                        onSearch={(value) => {
                            setKeyword(value.trim())
                            setPage(1)
                        }}
                    />
                }
            >
                {error ? (
                    <Alert type="error" showIcon message="收藏项加载失败" description={error} />
                ) : (
                    <>
                        <Table<WorkspaceViewItem>
                            rowKey="id"
                            size="small"
                            loading={loading}
                            columns={createColumns(
                                sort,
                                {
                                    busyItemId,
                    onGenerate: handleGenerate
                },
                                { showOrganizeColumns: !isKeyFolder }
                            )}
                            dataSource={view?.list.items ?? []}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            onChange={handleTableChange}
                            locale={{ emptyText: <Empty description="当前收藏夹暂无收藏项" /> }}
                        />
                        {pagination && pagination.total > 0 && (
                            <Pagination
                                style={paginationStyle}
                                size="small"
                                current={pagination.page}
                                pageSize={pagination.pageSize}
                                total={pagination.total}
                                showSizeChanger={false}
                                showTotal={(total) => `共 ${total} 条`}
                                onChange={setPage}
                            />
                        )}
                    </>
                )}
            </Card>

            <FolderProfileEditModal
                open={profileOpen}
                folderId={container.id}
                folderTitle={container.title}
                initial={viewContainer?.description ?? null}
                onClose={() => setProfileOpen(false)}
                onSaved={() => {
                    reload()
                    onSidebarReload()
                }}
            />

            <ItemSuggestionModal
                open={suggestionModal != null}
                itemTitle={suggestionModal?.item.title ?? ''}
                result={suggestionModal?.result ?? null}
                confirmingFolderId={confirmingFolderId}
                onClose={() => setSuggestionModal(null)}
                onConfirm={handleConfirmCandidate}
            />
        </>
    )
}
