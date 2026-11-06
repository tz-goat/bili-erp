import { Alert, Badge, Empty, Menu, Spin } from 'antd'
import type { MenuProps } from 'antd'

import type { SidebarItem, WorkspaceSidebar } from '../../api/types'

const menuStyle = { borderInlineEnd: 'none' }
const alertStyle = { margin: 12 }
const placeholderStyle = { padding: '16px 12px' }
const labelStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }
const titleStyle = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

type WorkspaceNavProps = {
    sidebar: WorkspaceSidebar | null
    loading: boolean
    error: string | null
    selectedContainerId: string | null
    onSelect: (containerId: string) => void
}

/**
 * 工作区左栏：把 sidebar 接口给的三分区原样渲染成导航。
 * 只负责「展示 + 选中」；某个分区能不能用由后端返回的 enabled 决定，前端不重新判断。
 */
export function WorkspaceNav({ sidebar, loading, error, selectedContainerId, onSelect }: WorkspaceNavProps) {
    if (loading) {
        return <Spin style={placeholderStyle} />
    }

    if (error) {
        return <Alert type="error" showIcon message="左栏加载失败" description={error} style={alertStyle} />
    }

    if (!sidebar) {
        return <Empty description="暂无工作区数据" style={placeholderStyle} />
    }

    // 分区转成 Menu 的分组：只有叶子节点可点，分组标题天然不可点
    const menuItems: MenuProps['items'] = sidebar.sections.map((section) => ({
        key: section.id,
        type: 'group',
        label: section.enabled ? section.title : `${section.title}（未接入）`,
        children: section.items.map((item) => ({ key: item.id, label: <NavItemLabel item={item} /> }))
    }))

    return (
        <Menu
            mode="inline"
            style={menuStyle}
            items={menuItems}
            selectedKeys={selectedContainerId ? [selectedContainerId] : []}
            onClick={({ key }) => onSelect(String(key))}
        />
    )
}

/** 导航项标签：标题 + 待处理数。纯文字列表，不引入封面图，保证左栏信息密度。 */
function NavItemLabel({ item }: { item: SidebarItem }) {
    return (
        <span style={labelStyle}>
            <span style={titleStyle} title={item.title}>
                {item.title}
            </span>
            {item.pendingCount > 0 && <Badge count={item.pendingCount} size="small" />}
        </span>
    )
}
