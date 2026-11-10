import { useState } from 'react'
import { Alert, Card, Descriptions, Empty, Pagination, Space, Table, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import type { CSSProperties } from 'react'

import type { SidebarItem, WorkspaceViewItem } from '../../api/types'
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

/** 列对齐旧原型 folder_detail.ejs，去掉本地库未存的三方计数（播放 / 收藏 / 弹幕）。 */
const columns: TableProps<WorkspaceViewItem>['columns'] = [
    {
        title: '标题',
        dataIndex: 'title',
        key: 'title',
        width: 320,
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
    { title: '作者', key: 'upper', width: 140, render: (_, item) => item.upper.name ?? '-' },
    { title: '时长', dataIndex: 'durationLabel', key: 'duration', width: 80 },
    {
        title: '发布时间',
        dataIndex: 'publishTime',
        key: 'publishTime',
        width: 160,
        render: (value: string | null) => value ?? '-'
    },
    {
        title: '收藏时间',
        dataIndex: 'favTime',
        key: 'favTime',
        width: 160,
        render: (value: string | null) => value ?? '-'
    },
    {
        title: '简介',
        dataIndex: 'intro',
        key: 'intro',
        width: 320,
        // 原生 title 做长文本预览，避免再叠一层 Tooltip 增加渲染成本
        render: (intro: string) => (
            <span style={introStyle} title={intro}>
                {intro || '-'}
            </span>
        )
    },
    { title: 'BVID', dataIndex: 'sourceBvid', key: 'sourceBvid', width: 120 },
    { title: 'ID', dataIndex: 'sourceVideoId', key: 'sourceVideoId', width: 120 }
]

type WorkspaceDetailProps = {
    container: SidebarItem | null
}

/**
 * 工作区右栏。
 * 头部身份标签取自左栏已加载的 sidebar item（零额外请求），容器级统计与收藏项表格由 container view 接口拉取；
 * 二者都以「当前容器」为准，所以切换容器时由父级用 key 重挂载，分页状态自然回到第一页。
 */
export function WorkspaceDetail({ container }: WorkspaceDetailProps) {
    const [page, setPage] = useState(1)
    const { view, loading, error } = useWorkspaceView(container?.id ?? null, page)

    if (!container) {
        return <Empty style={emptyStyle} description="请从左侧选择一个容器" />
    }

    const pagination = view?.list.pagination

    return (
        <>
            <Typography.Title level={3} style={titleStyle}>
                {container.title}
            </Typography.Title>
            <Space style={metaStyle} size={8} wrap>
                <Tag color="blue">{container.type}</Tag>
                {container.isKeyFolder && <Tag color="geekblue">关键收藏夹</Tag>}
                <Tag color={container.profileCompleted ? 'green' : 'default'}>
                    {container.profileCompleted ? '说明已完成' : '说明未完成'}
                </Tag>
                {container.sourceFolderId && (
                    <Typography.Text type="secondary">来源 ID：{container.sourceFolderId}</Typography.Text>
                )}
            </Space>
            {/* 容器级统计口径覆盖整个收藏夹、不随筛选与分页变化，所以单独一行呈现 */}
            {view && (
                <Descriptions
                    size="small"
                    column={5}
                    style={statsStyle}
                    items={[
                        { key: 'total', label: '收藏项', children: view.stats.totalItems },
                        { key: 'pending', label: '待确认', children: view.stats.pendingDecisionCount },
                        { key: 'confirmed', label: '已确认', children: view.stats.confirmedCount },
                        { key: 'deferred', label: '暂不处理', children: view.stats.deferredCount },
                        { key: 'suggestion', label: '已生成建议', children: view.stats.suggestionCoverageCount }
                    ]}
                />
            )}
            <Card title="收藏项">
                {error ? (
                    <Alert type="error" showIcon message="收藏项加载失败" description={error} />
                ) : (
                    <>
                        <Table<WorkspaceViewItem>
                            rowKey="id"
                            size="small"
                            loading={loading}
                            columns={columns}
                            dataSource={view?.list.items ?? []}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
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
        </>
    )
}
