import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Where the backend answers in development.
 *
 * <p>Port 8080 by default, as the backend starts by itself. `API_TARGET` overrides it for the
 * case that something else already holds that port — Docker Desktop publishes container ports
 * through a relay and takes it away often enough for this to be worth a variable.
 */
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:8080'

/**
 * Development setup.
 *
 * The backend runs on its own port and has no CORS configuration. Authentication hangs on a
 * session cookie, and a cookie across origins costs more than a proxy is worth. In
 * development the browser therefore only ever sees the Vite server: `/api` is forwarded to
 * Spring unchanged, cookies included.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/actuator': { target: API_TARGET, changeOrigin: false },
    },
  },
})
