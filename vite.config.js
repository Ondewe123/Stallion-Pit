import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

function gitCommit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

// Dev-only: stop devices (iPad/Infinix) serving STALE cached JS, and log every
// request with its device type so we can see what each device actually loads.
function devDiagnostics() {
  return {
    name: 'dev-diagnostics',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader('Cache-Control', 'no-store, max-age=0')
        const ua = req.headers['user-agent'] || ''
        const device = /iPad|iPhone|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'desktop'
        const url = req.url || ''
        // skip noisy internal/HMR/dependency traffic; log app navigations + chunks
        if (!url.includes('/@vite') && !url.includes('/@react') && !url.includes('/node_modules/')) {
          console.log(`[req] ${device.padEnd(7)} ${req.method} ${url}`)
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devDiagnostics()],
  define: {
    __APP_VERSION__: JSON.stringify(gitCommit()),
  },
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
