import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // strictPort: fail loudly if 5173 is taken instead of drifting to 5174+
    // (which could collide with another Antigravity workspace's dev server).
    strictPort: true,
  },
})
