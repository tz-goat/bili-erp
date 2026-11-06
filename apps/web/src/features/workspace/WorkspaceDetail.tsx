import { Card, Empty, Space, Tag, Typography } from 'antd'

import type { SidebarItem } from '../../api/types'

const emptyStyle = { marginTop: 80 }
const titleStyle = { marginTop: 0 }
const metaStyle = { marginBottom: 16 }

type WorkspaceDetailProps = {
    container: SidebarItem | null
}

/**
 * 工作区右栏。
 * 1.16 只做到「容器头部 + 空态」：收藏项表格与容器统计分别由 2.2 / 2.3 接入，
 * 所以这里刻意不请求 container view 接口，避免提前把 view model 绑死在页面上。
 */
export function WorkspaceDetail({ container }: WorkspaceDetailProps) {
    if (!container) {
        return <Empty style={emptyStyle} description="请从左侧选择一个容器" />
    }

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
                <Tag>{container.itemCount} 条收藏项</Tag>
                <Tag>{container.pendingCount} 条待处理</Tag>
                {container.sourceFolderId && (
                    <Typography.Text type="secondary">来源 ID：{container.sourceFolderId}</Typography.Text>
                )}
            </Space>
            <Card title="收藏项">
                <Typography.Text type="secondary">表格将在 2.2 接入。</Typography.Text>
            </Card>
        </>
    )
}
