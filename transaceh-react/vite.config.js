import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Base: dev tetap di root (localhost:5173); build & preview memakai /Agent-Travel/
// agar cocok dengan GitHub Pages project site (mavianandria-dev.github.io/Agent-Travel/).
export default defineConfig(({ mode }) => ({
  base: mode === 'development' ? '/' : '/Agent-Travel/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': import.meta.dirname + '/src',
    },
  },
}))
