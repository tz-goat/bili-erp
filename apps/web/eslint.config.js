import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * ESLint flat config 基线：JS 推荐规则 + TS 推荐规则 + React Hooks / Refresh。
 * 只做正确性与 Hooks 约束，格式一律交给 Prettier，避免两套工具互相覆盖。
 * 这里手动注册插件而不是直接用 react-hooks 的预设：它的 preset 仍是 eslintrc
 * 风格的 plugins 数组，直接展开会被 flat config 拒绝。
 */
export default tseslint.config(
    { ignores: ['dist'] },
    {
        files: ['**/*.{ts,tsx}'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.browser
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh
        },
        rules: {
            ...reactHooks.configs['recommended-latest'].rules,
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
        }
    }
)
