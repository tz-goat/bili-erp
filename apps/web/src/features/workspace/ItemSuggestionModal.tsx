import { Alert, Button, List, Modal, Popconfirm, Space, Typography } from 'antd'

import type { SuggestionResult } from '../../api/types'

type ItemSuggestionModalProps = {
    open: boolean
    itemTitle: string
    result: SuggestionResult | null
    confirmingFolderId: string | null
    onClose: () => void
    onConfirm: (candidate: SuggestionResult['candidates'][number]) => void
}

/**
 * 展示一次按需生成的归位候选。
 * 每个候选单独「采用」：先点采用，再在气泡里手动确认，才写 decision；不做批量、不自动落库。
 */
export function ItemSuggestionModal({
    open,
    itemTitle,
    result,
    confirmingFolderId,
    onClose,
    onConfirm
}: ItemSuggestionModalProps) {
    return (
        <Modal title={`归位建议 · ${itemTitle}`} open={open} onCancel={onClose} footer={null} destroyOnHidden width={560}>
            {!result ? null : result.skipped ? (
                <Alert type="warning" showIcon message={result.skipped.message} />
            ) : (
                <List
                    dataSource={result.candidates}
                    locale={{ emptyText: '没有候选' }}
                    renderItem={(candidate) => (
                        <List.Item
                            actions={[
                                <Popconfirm
                                    key="adopt"
                                    title={`确定归入「${candidate.folderTitle}」？`}
                                    okText="确定采用"
                                    cancelText="取消"
                                    disabled={confirmingFolderId != null}
                                    onConfirm={() => onConfirm(candidate)}
                                >
                                    <Button
                                        type="link"
                                        loading={confirmingFolderId === candidate.folderId}
                                        disabled={confirmingFolderId != null && confirmingFolderId !== candidate.folderId}
                                    >
                                        采用
                                    </Button>
                                </Popconfirm>
                            ]}
                        >
                            <List.Item.Meta
                                title={
                                    <Space size={8}>
                                        <Typography.Text>
                                            #{candidate.rank} {candidate.folderTitle}
                                        </Typography.Text>
                                    </Space>
                                }
                                description={<Typography.Text type="secondary">{candidate.reason}</Typography.Text>}
                            />
                        </List.Item>
                    )}
                />
            )}
        </Modal>
    )
}
