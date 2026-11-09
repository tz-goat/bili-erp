import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, Menu, Result, Spin, Tag, Typography } from 'antd'

import { saveFolderProfile } from '../../api/folder-profiles'
import { fetchWorkspaceView } from '../../api/workspace'
import type { FolderProfileInput } from '../../api/types'
import type { InitializationGateState } from './useInitializationGate'

const centeredStyle = { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }
const contentStyle = { maxWidth: 640 }
const pageStyle = { height: '100%', overflow: 'auto', padding: 24, background: '#f5f5f5' }
const stackStyle = { display: 'flex', flexDirection: 'column' as const, gap: 16, maxWidth: 960, margin: '0 auto' }
const checkListStyle = { display: 'flex', flexDirection: 'column' as const, gap: 12, maxHeight: 420, overflow: 'auto' }
const profileLayoutStyle = {
    display: 'grid',
    gridTemplateColumns: '240px minmax(0, 1fr)',
    gap: 16,
    alignItems: 'start'
}
const metaStyle = { display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginTop: 8 }
const emptyProfile: FolderProfileInput = { includeTopics: '', excludeTopics: '', keywords: [], purpose: '', notes: '' }

/**
 * 初始化入口页：把冷启动引导、导入轮询、关键收藏夹勾选、用途说明录入串成一条路。
 * 这里故意只消费现有接口，不新造「初始化状态」后端资源，避免口径再次分叉。
 */
export function InitializationEntry({ gate }: { gate: InitializationGateState }) {
    if (gate.phase === 'loading') {
        return (
            <div style={centeredStyle}>
                <Spin size="large" description="正在检查初始化状态" />
            </div>
        )
    }

    if (gate.phase === 'error') {
        return (
            <div style={centeredStyle}>
                <div style={contentStyle}>
                    <Alert
                        type="error"
                        showIcon
                        title="初始化状态读取失败"
                        description={gate.error}
                        action={
                            <Button type="primary" onClick={() => void gate.onRetry()}>
                                重试
                            </Button>
                        }
                    />
                </div>
            </div>
        )
    }

    if (gate.phase === 'import_intro') {
        return (
            <div style={centeredStyle}>
                <Result
                    status={gate.latestRun?.status === 'failed' ? 'warning' : 'info'}
                    title={gate.latestRun?.status === 'failed' ? '最近一次导入未完成' : '先完成一次来源导入'}
                    subTitle="工作区、关键收藏夹和说明表单都依赖本地来源数据；首次使用需要先把收藏夹导入到 SQLite。"
                    extra={
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                            <Button
                                type="primary"
                                loading={gate.startingImport}
                                onClick={() => void gate.onStartImport()}
                            >
                                开始导入来源数据
                            </Button>
                            <Typography.Text type="secondary">
                                1.17 先把引导、轮询和初始化表单串起来；更细的异常链路打磨留给后续步骤。
                            </Typography.Text>
                        </div>
                    }
                />
            </div>
        )
    }

    if (gate.phase === 'import_progress' && gate.latestRun) {
        return (
            <div style={centeredStyle}>
                <Result
                    status="info"
                    title="正在导入来源数据"
                    subTitle="导入 run 已启动，页面会自动轮询状态；完成后将继续进入关键收藏夹与说明填写步骤。"
                    extra={
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                            <Spin description="正在等待导入完成" />
                            <Typography.Text>runId：{gate.latestRun.runId}</Typography.Text>
                            <Typography.Text type="secondary">
                                开始时间：{gate.latestRun.startedAt ?? '—'}
                            </Typography.Text>
                        </div>
                    }
                />
            </div>
        )
    }

    if (gate.phase === 'key_folders') {
        return (
            <div style={pageStyle}>
                <div style={stackStyle}>
                    <Card title="第 2 步：勾选关键收藏夹">
                        <Typography.Paragraph>
                            关键收藏夹会进入左栏 `关键收藏夹` 分区，并获得填写 `收藏夹说明` 的资格。
                        </Typography.Paragraph>
                        <Typography.Paragraph type="secondary">
                            为了让初始化流程能真正进入下一步，这里至少选择 1 个关键收藏夹。
                        </Typography.Paragraph>
                        {gate.error && (
                            <Alert
                                type="error"
                                showIcon
                                title="关键收藏夹保存失败"
                                description={gate.error}
                                style={{ marginBottom: 16 }}
                            />
                        )}
                        <Checkbox.Group
                            value={gate.selectedKeyFolderIds}
                            style={{ width: '100%' }}
                            onChange={(values) => gate.onChangeSelectedKeyFolderIds(values.map(String))}
                        >
                            <div style={checkListStyle}>
                                {gate.allFolders.map((folder) => {
                                    return (
                                        <Checkbox key={folder.id} value={folder.id}>
                                            <span>{folder.title}</span>
                                            <Typography.Text type="secondary">
                                                （{folder.itemCount} 条收藏项）
                                            </Typography.Text>
                                        </Checkbox>
                                    )
                                })}
                            </div>
                        </Checkbox.Group>
                        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <Typography.Text type="secondary">
                                已选择 {gate.selectedKeyFolderIds.length} 个关键收藏夹
                            </Typography.Text>
                            <Button
                                type="primary"
                                loading={gate.savingKeyFolders}
                                onClick={() => void gate.onSubmitKeyFolders()}
                            >
                                保存并继续
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        )
    }

    if (gate.phase === 'profile_forms') {
        return <FolderProfileStep gate={gate} />
    }

    return null
}

/**
 * 关键收藏夹用途填写页：当前只收一句核心说明，先把初始化成本压低。
 * 结构化字段保留在接口里，但初始化阶段不再强迫用户逐项填写，后续可交给 Agent 草拟。
 */
function FolderProfileStep({ gate }: { gate: InitializationGateState }) {
    const [form] = Form.useForm<FolderProfileInput>()
    const [savingProfile, setSavingProfile] = useState(false)
    const [profileError, setProfileError] = useState<string | null>(null)
    const [loadedProfileFolderId, setLoadedProfileFolderId] = useState<string | null>(null)

    const activeFolder = useMemo(() => {
        return (
            gate.keyFolderItems.find((item) => item.id === gate.activeProfileFolderId) ?? gate.keyFolderItems[0] ?? null
        )
    }, [gate.activeProfileFolderId, gate.keyFolderItems])

    const loadingProfile = Boolean(activeFolder) && loadedProfileFolderId !== activeFolder.id

    useEffect(() => {
        if (!activeFolder || loadedProfileFolderId === activeFolder.id) {
            return
        }

        let cancelled = false

        fetchWorkspaceView(activeFolder.id, { pageSize: 1 })
            .then((view) => {
                if (!cancelled) {
                    form.setFieldsValue(view.container.description ?? emptyProfile)
                    setLoadedProfileFolderId(activeFolder.id)
                    setProfileError(null)
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    form.setFieldsValue(emptyProfile)
                    setLoadedProfileFolderId(activeFolder.id)
                    setProfileError(error instanceof Error ? error.message : '未知错误')
                }
            })

        return () => {
            cancelled = true
        }
    }, [activeFolder, form, loadedProfileFolderId])

    if (!activeFolder) {
        return null
    }

    return (
        <div style={pageStyle}>
            <div style={stackStyle}>
                <Card title="第 3 步：填写关键收藏夹用途">
                    <Typography.Paragraph>
                        这里先补一句“这个收藏夹为什么存在”。当前只要求填 `用途/说明`，后续再由 Agent
                        基于收藏夹样本自动补全更细的结构化字段，用户只需要微调。
                    </Typography.Paragraph>
                    <div style={profileLayoutStyle}>
                        <div>
                            <Menu
                                mode="inline"
                                selectedKeys={[activeFolder.id]}
                                items={gate.keyFolderItems.map((item) => ({
                                    key: item.id,
                                    label: (
                                        <div>
                                            <div>{item.title}</div>
                                            <div style={metaStyle}>
                                                {item.profileCompleted ? (
                                                    <Tag color="green">已完成</Tag>
                                                ) : (
                                                    <Tag color="gold">待填写</Tag>
                                                )}
                                                <Typography.Text type="secondary">{item.itemCount} 条</Typography.Text>
                                            </div>
                                        </div>
                                    )
                                }))}
                                onClick={({ key }) => gate.onSelectProfileFolder(String(key))}
                            />
                        </div>
                        <Card
                            title={activeFolder.title}
                            extra={
                                <Typography.Text type="secondary">
                                    剩余 {gate.pendingProfileItems.length} / {gate.keyFolderItems.length}
                                </Typography.Text>
                            }
                        >
                            {profileError && (
                                <Alert
                                    type="error"
                                    showIcon
                                    title="用途说明读取失败"
                                    description={profileError}
                                    style={{ marginBottom: 16 }}
                                />
                            )}
                            {loadingProfile ? (
                                <Spin description="正在加载当前收藏夹说明" />
                            ) : (
                                <Form<FolderProfileInput>
                                    form={form}
                                    layout="vertical"
                                    onFinish={async (values) => {
                                        setSavingProfile(true)
                                        setProfileError(null)

                                        try {
                                            await saveFolderProfile(activeFolder.id, {
                                                includeTopics: '',
                                                excludeTopics: '',
                                                keywords: [],
                                                purpose: values.purpose.trim(),
                                                notes: ''
                                            })
                                            setLoadedProfileFolderId(null)
                                            await gate.onProfileSaved()
                                        } catch (error: unknown) {
                                            setProfileError(error instanceof Error ? error.message : '未知错误')
                                        } finally {
                                            setSavingProfile(false)
                                        }
                                    }}
                                >
                                    <Form.Item
                                        label="收藏夹用途 / 一句话说明"
                                        name="purpose"
                                        rules={[{ required: true, message: '请填写一句用途说明' }]}
                                    >
                                        <Input.TextArea
                                            rows={4}
                                            placeholder="例如：收藏前端工程实践与工具链资料，后续给 Agent 自动补全关键词和边界。"
                                        />
                                    </Form.Item>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                        <Typography.Text type="secondary">
                                            保存后会自动切到下一个未完成的关键收藏夹；后续再补 Agent
                                            自动草拟与人工微调。
                                        </Typography.Text>
                                        <Button type="primary" htmlType="submit" loading={savingProfile}>
                                            保存并继续
                                        </Button>
                                    </div>
                                </Form>
                            )}
                        </Card>
                    </div>
                </Card>
            </div>
        </div>
    )
}
