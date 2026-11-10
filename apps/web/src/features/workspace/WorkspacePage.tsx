import { useState } from 'react'
import { Layout } from 'antd'

import { useWorkspaceSidebar } from './useWorkspaceSidebar'
import { WorkspaceDetail } from './WorkspaceDetail'
import { WorkspaceNav } from './WorkspaceNav'

const { Sider, Content } = Layout

const pageStyle = { height: '100%' }
const siderStyle = { background: '#fff', borderRight: '1px solid #f0f0f0', overflow: 'auto' }
const contentStyle = { padding: 24, overflow: 'auto' }

/**
 * 工作区页面：左栏导航 + 右栏明细的双栏骨架。
 * 选中态在这里收口——用户点过就用他点的，没点过就回落到后端给的默认容器。
 * 因此不需要用 effect 去「初始化默认值」，也就不会出现 effect 覆盖用户选择的竞态。
 */
export function WorkspacePage() {
    const { sidebar, loading, error } = useWorkspaceSidebar()
    const [pickedContainerId, setPickedContainerId] = useState<string | null>(null)

    const selectedContainerId = pickedContainerId ?? sidebar?.defaultContainerId ?? null
    const containers = sidebar?.sections.flatMap((section) => section.items) ?? []
    const selectedContainer = containers.find((item) => item.id === selectedContainerId) ?? null

    return (
        <Layout style={pageStyle}>
            <Sider width={280} style={siderStyle}>
                <WorkspaceNav
                    sidebar={sidebar}
                    loading={loading}
                    error={error}
                    selectedContainerId={selectedContainerId}
                    onSelect={setPickedContainerId}
                />
            </Sider>
            <Content style={contentStyle}>
                {/* 用容器 id 做 key：切容器时重挂载右栏，分页与明细状态一并回到该容器的初始态 */}
                <WorkspaceDetail key={selectedContainerId ?? 'none'} container={selectedContainer} />
            </Content>
        </Layout>
    )
}
