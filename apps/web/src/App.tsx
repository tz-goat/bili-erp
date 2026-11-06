import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import { AppLayout } from './app/AppLayout'

/**
 * 应用根组件：只负责注入 antd 的中文文案，再挂上布局壳。
 * 后续的全局主题、路由都挂在这一层，避免散到页面组件里。
 */
export default function App() {
    return (
        <ConfigProvider locale={zhCN}>
            <AppLayout />
        </ConfigProvider>
    )
}
