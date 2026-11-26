import { useEffect, useState } from 'react'
import { Alert, Modal, Select, Typography } from 'antd'

import type { SidebarItem } from '../../api/types'

type TransferWatchLaterModalProps = {
    open: boolean
    itemTitle: string
    folders: SidebarItem[]
    confirming: boolean
    onClose: () => void
    onConfirm: (targetFolderId: string) => void
}

/**
 * 稍后再看本地转存：只选目标收藏夹，不写 note，也不写回平台。
 */
export function TransferWatchLaterModal({
    open,
    itemTitle,
    folders,
    confirming,
    onClose,
    onConfirm
}: TransferWatchLaterModalProps) {
    const [targetFolderId, setTargetFolderId] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            setTargetFolderId(null)
        }
    }, [open])

    return (
        <Modal
            title="转存到收藏夹"
            open={open}
            onCancel={confirming ? undefined : onClose}
            onOk={() => {
                if (targetFolderId) {
                    onConfirm(targetFolderId)
                }
            }}
            okText="确认转存"
            cancelText="取消"
            confirmLoading={confirming}
            okButtonProps={{ disabled: !targetFolderId }}
            destroyOnHidden
        >
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                「{itemTitle}」只记录本地转存意图，不会写回 B 站。
            </Typography.Paragraph>
            {folders.length === 0 ? (
                <Alert type="warning" showIcon message="还没有可转入的收藏夹，请先完成收藏夹导入。" />
            ) : (
                <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="选择目标收藏夹"
                    style={{ width: '100%' }}
                    value={targetFolderId}
                    onChange={setTargetFolderId}
                    options={folders.map((folder) => ({
                        value: folder.id,
                        label: folder.isKeyFolder ? `${folder.title}（关键）` : folder.title
                    }))}
                />
            )}
        </Modal>
    )
}
