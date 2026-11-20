#!/usr/bin/env node
/**
 * 草拟词表 AB 脚本：对照模型 / 思考模式 / 样本量 / 简介截断。
 *
 * 用法：
 *   node scripts/ab-draft-profile.mjs --list
 *   node scripts/ab-draft-profile.mjs --folder folder_2373157718 --dry-run
 *   node scripts/ab-draft-profile.mjs --folder folder_2373157718 --ab
 *   node scripts/ab-draft-profile.mjs --folder folder_2373157718 --model deepseek-flash --thinking off --samples 12 --intro 0
 *
 * 环境变量同服务端：OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL
 */

import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadEnvFiles(PROJECT_ROOT)

const SYSTEM_PROMPT = `你是 B 站收藏夹整理助手，负责把「用途说明 + 夹内视频样本」转成归位匹配词表。
只输出一个 JSON 对象，不要 markdown，不要解释。字段：
- includeTopics: 字符串，逗号或顿号分隔的主题词，用于标题/简介子串匹配
- excludeTopics: 字符串，逗号分隔，命中则整夹不作为候选
- keywords: 字符串数组，与 includeTopics 互补的具体词条

要求：词条要可解释、可命中，不要空泛词（如「视频」「相关」）；exclude 只在用途或样本明显排斥某类时再写。`

const args = parseArgs(process.argv.slice(2))
const apiKey = process.env.OPENAI_API_KEY?.trim() || ''
const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.deepseek.com').replace(/\/$/, '')
const defaultModel = process.env.OPENAI_MODEL?.trim() || 'deepseek-chat'
const dbPath = process.env.SQLITE_DATABASE_PATH?.trim() || path.join(PROJECT_ROOT, 'data', 'pl-dashboard.sqlite')

if (args.list) {
    listFolders(dbPath)
    process.exit(0)
}

if (!args.folder) {
    console.error('缺少 --folder <folderId>。先跑 --list 看有哪些关键收藏夹。')
    process.exit(1)
}

const folder = loadFolder(dbPath, args.folder)
if (!folder) {
    console.error(`找不到收藏夹：${args.folder}`)
    process.exit(1)
}

if (args.ab) {
    await runAbMatrix(folder, {
        models: args.models.length > 0 ? args.models : ['deepseek-v4-pro', 'deepseek-flash'],
        sampleLimits: args.sampleLimits.length > 0 ? args.sampleLimits : [30, 12],
        introChars: args.introCharsList.length > 0 ? args.introCharsList : [120, 0],
        thinkingModes: args.thinkingModes.length > 0 ? args.thinkingModes : ['on', 'off']
    })
    process.exit(0)
}

const config = {
    model: args.model || defaultModel,
    samples: args.samples ?? 30,
    intro: args.intro ?? 120,
    thinking: args.thinking || 'off'
}

const prompt = buildUserPrompt(folder, config.samples, config.intro)
const body = buildRequestBody({ model: config.model, thinking: config.thinking, user: prompt })

if (args.dryRun) {
    printDryRun({ baseUrl, apiKey, body, prompt, folder, config })
    process.exit(0)
}

if (!apiKey) {
    console.error('未配置 OPENAI_API_KEY')
    process.exit(1)
}

const result = await callOnce({ baseUrl, apiKey, body, label: formatLabel(config) })
printResult(result)

async function runAbMatrix(folder, matrix) {
    if (!apiKey) {
        console.error('未配置 OPENAI_API_KEY')
        process.exit(1)
    }

    const jobs = []
    for (const model of matrix.models) {
        for (const thinking of matrix.thinkingModes) {
            for (const samples of matrix.sampleLimits) {
                for (const intro of matrix.introChars) {
                    jobs.push({ model, thinking, samples, intro })
                }
            }
        }
    }

    console.log(`AB 矩阵：${jobs.length} 次请求 · 夹「${folder.title}」· purpose「${folder.purpose || '（空）'}」\n`)

    const rows = []
    for (const job of jobs) {
        const prompt = buildUserPrompt(folder, job.samples, job.intro)
        const body = buildRequestBody({ model: job.model, thinking: job.thinking, user: prompt })
        const label = formatLabel(job)
        process.stdout.write(`→ ${label} ... `)
        const result = await callOnce({ baseUrl, apiKey, body, label })
        console.log(`${result.ok ? `${result.elapsedMs}ms` : `FAIL ${result.error}`}`)
        rows.push(result)
    }

    console.log('\n===== 对照表 =====')
    console.table(
        rows.map((row) => ({
            label: row.label,
            ok: row.ok,
            ms: row.elapsedMs,
            promptChars: row.promptChars,
            promptTokens: row.usage?.prompt_tokens ?? null,
            completionTokens: row.usage?.completion_tokens ?? null,
            reasoningTokens: row.usage?.completion_tokens_details?.reasoning_tokens ?? null,
            includeTopics: row.draft?.includeTopics ?? '',
            keywords: Array.isArray(row.draft?.keywords) ? row.draft.keywords.join('|') : '',
            excludeTopics: row.draft?.excludeTopics ?? ''
        }))
    )

    const outPath = path.join(PROJECT_ROOT, 'tmp', `ab-draft-${folder.id}-${Date.now()}.json`)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, JSON.stringify({ folder, rows }, null, 2))
    console.log(`\n完整结果已写：${outPath}`)
}

function buildRequestBody({ model, thinking, user }) {
    const body = {
        model,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: user }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
    }

    // DeepSeek V4：省略 thinking 时默认开启思考；草拟词表应显式关掉。
    body.thinking = { type: thinking === 'off' ? 'disabled' : 'enabled' }
    return body
}

async function callOnce({ baseUrl, apiKey, body, label }) {
    const started = Date.now()
    try {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        })
        const payload = await response.json().catch(() => null)
        const elapsedMs = Date.now() - started

        if (!response.ok) {
            return {
                ok: false,
                label,
                elapsedMs,
                promptChars: body.messages[1].content.length,
                error: payload?.error?.message || response.statusText,
                usage: payload?.usage || null,
                draft: null,
                raw: payload
            }
        }

        const content = payload?.choices?.[0]?.message?.content || ''
        let draft = null
        try {
            draft = JSON.parse(stripFence(content))
        } catch {
            draft = { parseError: true, content }
        }

        return {
            ok: true,
            label,
            elapsedMs,
            promptChars: body.messages[1].content.length,
            usage: payload?.usage || null,
            draft,
            raw: payload
        }
    } catch (error) {
        return {
            ok: false,
            label,
            elapsedMs: Date.now() - started,
            promptChars: body.messages[1].content.length,
            error: error instanceof Error ? error.message : String(error),
            usage: null,
            draft: null,
            raw: null
        }
    }
}

function printDryRun({ baseUrl, apiKey, body, prompt, folder, config }) {
    const maskedKey = apiKey ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}` : 'MISSING'
    console.log(`# dry-run · ${folder.title} (${folder.id})`)
    console.log(`# purpose: ${folder.purpose || '（空）'}`)
    console.log(`# config: ${formatLabel(config)}`)
    console.log(`# promptChars: ${prompt.length}`)
    console.log(`# apiKey: ${maskedKey}`)
    console.log('')
    console.log('----- user prompt -----')
    console.log(prompt)
    console.log('----- request body -----')
    console.log(JSON.stringify(body, null, 2))
    console.log('----- curl -----')
    console.log(
        [
            `curl -sS '${baseUrl}/v1/chat/completions' \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H "Authorization: Bearer $OPENAI_API_KEY" \\`,
            `  -d '${JSON.stringify(body).replace(/'/g, `'\\''`)}'`
        ].join('\n')
    )
}

function printResult(result) {
    console.log(JSON.stringify(result, null, 2))
}

function buildUserPrompt(folder, sampleLimit, introChars) {
    const samples = folder.samples.slice(0, sampleLimit)
    const sampleLines = samples.map((row, index) => {
        const title = row.title || ''
        if (!introChars || introChars <= 0) {
            return `${index + 1}. ${title}`
        }
        const intro = (row.intro || '').replace(/\s+/g, ' ').slice(0, introChars)
        return `${index + 1}. ${title}${intro ? ` | ${intro}` : ''}`
    })

    return [
        `收藏夹标题：${folder.title || '（未知）'}`,
        `用户用途说明：${folder.purpose || '（未填写，请主要依据样本推断）'}`,
        `夹内视频样本（最多 ${samples.length} 条）：`,
        sampleLines.length > 0 ? sampleLines.join('\n') : '（暂无样本，请仅根据用途说明推断）'
    ].join('\n\n')
}

function loadFolder(dbPath, folderId) {
    const db = new DatabaseSync(dbPath)
    const folder = db.prepare(`
        SELECT f.id, f.title, p.purpose
        FROM source_folders AS f
        LEFT JOIN folder_profiles AS p ON p.folder_id = f.id
        WHERE f.id = ?
    `).get(folderId)

    if (!folder) {
        return null
    }

    const samples = db.prepare(`
        SELECT i.title, i.intro
        FROM source_folder_items AS sfi
        JOIN source_items AS i ON i.id = sfi.item_id
        WHERE sfi.folder_id = ? AND sfi.is_active = 1
        ORDER BY sfi.source_fav_time DESC, i.id ASC
        LIMIT 100
    `).all(folderId)

    return {
        id: folder.id,
        title: folder.title,
        purpose: folder.purpose || '',
        samples
    }
}

function listFolders(dbPath) {
    const db = new DatabaseSync(dbPath)
    const rows = db.prepare(`
        SELECT
            f.id,
            f.title,
            CASE WHEN k.folder_id IS NULL THEN 0 ELSE 1 END AS is_key,
            COALESCE(p.purpose, '') AS purpose,
            COUNT(sfi.id) AS item_count
        FROM source_folders AS f
        LEFT JOIN key_folders AS k ON k.folder_id = f.id
        LEFT JOIN folder_profiles AS p ON p.folder_id = f.id
        LEFT JOIN source_folder_items AS sfi ON sfi.folder_id = f.id AND sfi.is_active = 1
        GROUP BY f.id
        ORDER BY is_key DESC, item_count DESC, f.title ASC
    `).all()

    console.table(
        rows.map((row) => ({
            id: row.id,
            title: row.title,
            key: row.is_key ? 'Y' : '',
            items: row.item_count,
            purpose: row.purpose.slice(0, 40)
        }))
    )
}

function formatLabel({ model, thinking, samples, intro }) {
    return `${model}|think=${thinking}|n=${samples}|intro=${intro}`
}

function stripFence(text) {
    const trimmed = text.trim()
    if (trimmed.startsWith('```')) {
        return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    }
    return trimmed
}

function parseArgs(argv) {
    const out = {
        list: false,
        dryRun: false,
        ab: false,
        folder: null,
        model: null,
        models: [],
        samples: null,
        sampleLimits: [],
        intro: null,
        introCharsList: [],
        thinking: null,
        thinkingModes: []
    }

    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i]
        const next = argv[i + 1]
        if (token === '--list') out.list = true
        else if (token === '--dry-run') out.dryRun = true
        else if (token === '--ab') out.ab = true
        else if (token === '--folder') {
            out.folder = next
            i += 1
        } else if (token === '--model') {
            out.model = next
            i += 1
        } else if (token === '--models') {
            out.models = String(next)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            i += 1
        } else if (token === '--samples') {
            out.samples = Number(next)
            i += 1
        } else if (token === '--sample-limits') {
            out.sampleLimits = String(next)
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isInteger(n) && n > 0)
            i += 1
        } else if (token === '--intro') {
            out.intro = Number(next)
            i += 1
        } else if (token === '--intro-limits') {
            out.introCharsList = String(next)
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isInteger(n) && n >= 0)
            i += 1
        } else if (token === '--thinking') {
            out.thinking = next === 'off' ? 'off' : 'on'
            i += 1
        } else if (token === '--thinking-modes') {
            out.thinkingModes = String(next)
                .split(',')
                .map((s) => (s.trim() === 'off' ? 'off' : 'on'))
            i += 1
        }
    }

    return out
}

function loadEnvFiles(projectRoot) {
    for (const fileName of ['.env', '.env.local']) {
        const absolutePath = path.join(projectRoot, fileName)
        try {
            process.loadEnvFile?.(absolutePath)
        } catch (error) {
            if (error?.code !== 'ENOENT') {
                throw error
            }
        }
    }
}
