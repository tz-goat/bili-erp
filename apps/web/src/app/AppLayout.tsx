import { Layout, Typography } from 'antd'

import { WorkspacePage } from '../features/workspace/WorkspacePage'

const { Header, Content } = Layout

const shellStyle = { height: '100vh' }
const headerStyle = { display: 'flex', alignItems: 'center' }
const titleStyle = { color: '#fff', margin: 0 }
// 页面自己管理滚动（左右两栏独立滚），外壳只负责占满剩余高度
const contentStyle = { overflow: 'hidden' }

/**
 * 应用外壳：顶部标题 + 内容区。
 * 双栏结构属于 `工作区` 页面自身（见 workspace/WorkspacePage），外壳不再替它预设 Sider，
 * 这样将来工作台、目录页等其它页面可以各自决定布局。
 */
export function AppLayout() {
    return (
        <Layout style={shellStyle}>
            <Header style={headerStyle}>
                <Typography.Title level={4} style={titleStyle}>
                    视频收藏后台
                </Typography.Title>
            </Header>
            <Content style={contentStyle}>
                <WorkspacePage />
            </Content>
        </Layout>
    )
}
