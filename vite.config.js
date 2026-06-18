import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind 0.0.0.0 so phones/devices on the same WiFi can reach the dev server
    port: 5173,
    // strictPort: fail loudly if 5173 is taken instead of drifting to 5174+
    // (which could collide with another Antigravity workspace's dev server).
    strictPort: true,
  },
  test: {
    // pure-function unit tests (src/lib/calc) — no DOM needed
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
