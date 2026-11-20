import { useEffect, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Select, message } from 'antd'

import { ApiError } from '../../api/client'
import { draftFolderProfileStructure, saveFolderProfile } from '../../api/folder-profiles'
import type { FolderProfileInput } from '../../api/types'

const emptyProfile: FolderProfileInput = {
    includeTopics: '',
    excludeTopics: '',
    keywords: [],
    purpose: '',
    notes: ''
}

type FolderProfileEditModalProps = {
    open: boolean
    folderId: string
    folderTitle: string
    initial: FolderProfileInput | null
    onClose: () => void
    onSaved: () => void
}

/**
 * 关键收藏夹说明编辑。
 * purpose 给人读；includeTopics / keywords / excludeTopics 才是归位匹配词表。
 * notes 一期不暴露编辑，提交时原样带回，避免整份 PUT 把库里已有备注抹掉。
 */
export function FolderProfileEditModal({
    open,
    folderId,
    folderTitle,
    initial,
    onClose,
    onSaved
}: FolderProfileEditModalProps) {
    const [form] = Form.useForm<FolderProfileInput>()
    const [saving, setSaving] = useState(false)
    const [drafting, setDrafting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) {
            return
        }

        form.setFieldsValue({ ...emptyProfile, ...initial, notes: initial?.notes ?? '' })
        setError(null)
    }, [open, initial, form])

    const handleOk = async () => {
        try {
            const values = await form.validateFields()
            setSaving(true)
            setError(null)
            await saveFolderProfile(folderId, {
                purpose: values.purpose ?? '',
                includeTopics: values.includeTopics ?? '',
                excludeTopics: values.excludeTopics ?? '',
                keywords: values.keywords ?? [],
                notes: initial?.notes ?? ''
            })
            onSaved()
            onClose()
        } catch (err) {
            if (err && typeof err === 'object' && 'errorFields' in err) {
                return
            }
            setError(err instanceof Error ? err.message : '保存失败')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal
            title={`编辑说明 · ${folderTitle}`}
            open={open}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={saving}
            destroyOnHidden
            okText="保存"
            cancelText="取消"
            width={560}
        >
            {error && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={error} />}
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item
                    name="purpose"
                    label="用途说明"
                    rules={[{ required: true, whitespace: true, message: '请填写用途说明' }]}
                    extra="给人读的一句话；不参与关键词匹配。"
                >
                    <Input.TextArea rows={2} placeholder="例如：放前端工程与构建相关的长视频" />
                </Form.Item>
                <Form.Item label=" " colon={false}>
                    <Button
                        loading={drafting}
                        disabled={saving}
                        onClick={async () => {
                            const purpose = form.getFieldValue('purpose')?.trim()
                            if (!purpose) {
                                message.warning('请先填写用途说明')
                                return
                            }

                            setDrafting(true)
                            setError(null)
                            try {
                                const result = await draftFolderProfileStructure(folderId, { purpose })
                                form.setFieldsValue({
                                    includeTopics: result.draft.includeTopics,
                                    excludeTopics: result.draft.excludeTopics,
                                    keywords: result.draft.keywords
                                })
                                message.success(`已草拟（${result.meta.sampleCount} 条样本），请确认后保存`)
                            } catch (err) {
                                if (err instanceof ApiError) {
                                    const payload = err.payload as { error?: string; message?: string }
                                    if (payload?.error === 'llm_not_configured') {
                                        message.error('未配置 OPENAI_API_KEY')
                                        return
                                    }
                                    setError(payload?.message ?? err.message)
                                    return
                                }
                                setError(err instanceof Error ? err.message : '草拟失败')
                            } finally {
                                setDrafting(false)
                            }
                        }}
                    >
                        草拟词表（DeepSeek）
                    </Button>
                </Form.Item>
                <Form.Item
                    name="includeTopics"
                    label="纳入主题"
                    extra="逗号或顿号分隔；会参与标题/简介的关键词匹配。"
                >
                    <Input.TextArea rows={2} placeholder="例如：前端, 工程化, TypeScript" />
                </Form.Item>
                <Form.Item name="keywords" label="关键词" extra="结构化词条，与纳入主题合并成同一套命中词表。">
                    <Select
                        mode="tags"
                        tokenSeparators={[',', '，', '、']}
                        placeholder="输入后回车添加"
                        // 词条多时选择器会无限长高，压住弹窗；固定高度内部滚动
                        styles={{ root: { maxHeight: 120, overflowY: 'auto' } }}
                    />
                </Form.Item>
                <Form.Item name="excludeTopics" label="排除主题" extra="命中任一排除词则整夹不作为候选。">
                    <Input.TextArea rows={2} placeholder="例如：游戏, 杂谈" />
                </Form.Item>
            </Form>
        </Modal>
    )
}
