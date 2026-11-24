import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { parseDraftPayload } from './draft-folder-profile-structure.js'

describe('parseDraftPayload', () => {
    test('解析合法 JSON', () => {
        const draft = parseDraftPayload(
            JSON.stringify({
                includeTopics: '前端, 工程化',
                excludeTopics: '游戏'
            })
        )

        assert.deepEqual(draft, {
            includeTopics: '前端, 工程化',
            excludeTopics: '游戏'
        })
    })

    test('去掉 markdown 围栏', () => {
        const draft = parseDraftPayload('```json\n{"includeTopics":"摄影","excludeTopics":""}\n```')
        assert.equal(draft.includeTopics, '摄影')
        assert.equal(draft.excludeTopics, '')
    })

    test('非法 JSON 抛 invalid_draft_response', () => {
        assert.throws(() => parseDraftPayload('not-json'), (error) => error.code === 'invalid_draft_response')
    })
})