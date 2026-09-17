import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// VITE_BASE lets the GitHub Pages workflow build for /crossing-escrow/; local dev stays at /.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
})
