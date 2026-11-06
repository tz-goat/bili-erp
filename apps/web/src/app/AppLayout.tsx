import { Layout, Typography } from 'antd'

const { Header, Sider, Content } = Layout

const shellStyle = { height: '100vh' }
const headerStyle = { display: 'flex', alignItems: 'center' }
const titleStyle = { color: '#fff', margin: 0 }
const siderStyle = { background: '#fff' }
const contentStyle = { padding: 24, overflow: 'auto' }

/**
 * 工作区外壳：固定「顶部标题 + 左栏导航 + 右栏内容」三段结构。
 * 1.15 只搭骨架，左右两侧都留空，分区导航与收藏项表格分别由 1.16 / 1.17 填充。
 */
export function AppLayout() {
    return (
        <Layout style={shellStyle}>
            <Header style={headerStyle}>
                <Typography.Title level={4} style={titleStyle}>
                    视频收藏后台
                </Typography.Title>
            </Header>
            <Layout>
                <Sider width={280} style={siderStyle} />
                <Content style={contentStyle} />
            </Layout>
        </Layout>
    )
}
