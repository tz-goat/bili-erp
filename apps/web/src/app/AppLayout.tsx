import { Layout, Typography } from 'antd'

import { InitializationEntry } from '../features/initialization/InitializationEntry'
import { useInitializationGate } from '../features/initialization/useInitializationGate'
import { WorkspacePage } from '../features/workspace/WorkspacePage'

const { Header, Content } = Layout

const shellStyle = { height: '100vh' }
const headerStyle = { display: 'flex', alignItems: 'center' }
const titleStyle = { color: '#fff', margin: 0 }
// 页面自己管理滚动（左右两栏独立滚），外壳只负责占满剩余高度
const contentStyle = { overflow: 'hidden' }

/**
 * 应用外壳：顶部标题 + 内容区。
 * 首页先走初始化入口裁判：从冷启动导入、关键收藏夹、说明录入一路串到工作区，
 * 这样首次使用与日常整理共用同一个壳，但状态分流仍只收口在这一层。
 */
export function AppLayout() {
    const gate = useInitializationGate()

    return (
        <Layout style={shellStyle}>
            <Header style={headerStyle}>
                <Typography.Title level={4} style={titleStyle}>
                    视频收藏后台
                </Typography.Title>
            </Header>
            <Content style={contentStyle}>
                {gate.phase === 'workspace' ? <WorkspacePage /> : <InitializationEntry gate={gate} />}
            </Content>
        </Layout>
    )
}
