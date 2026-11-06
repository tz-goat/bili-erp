import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 开发期把 /api 透传到后端 3001。
 * 这样前端代码里一律写相对路径，既避开 CORS，也不用维护多套 baseURL。
 */
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true
            }
        }
    }
})
