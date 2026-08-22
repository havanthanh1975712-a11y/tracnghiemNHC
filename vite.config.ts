
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env từ file .env (nếu có)
  const env = loadEnv(mode, (process as any).cwd(), '')
  
  // Lấy API_KEY: Ưu tiên từ môi trường hệ thống (Vercel) rồi mới đến file .env
  const apiKey = process.env.API_KEY || env.API_KEY || '';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.')
      }
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
    },
    define: {
      // Đẩy biến này vào code chạy ở trình duyệt
      'process.env.API_KEY': JSON.stringify(apiKey)
    }
  }
})
