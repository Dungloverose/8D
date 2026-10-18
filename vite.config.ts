import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/8D/', // 👈 Thêm dòng này (nhớ đúng tên repository của bạn là 8D)
})
