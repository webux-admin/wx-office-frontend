import net from 'node:net'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Where the backend answers in development.
 *
 * <p>Port 8082, matching `server.port` in the backend — not 8080, where Docker Desktop
 * regularly publishes some other container. As a literal IP on purpose: a host name would
 * be resolved again for every proxied request, and the answer decides between IPv4 and
 * IPv6 anew each time. The backend listens on both families, the IPv4 address is always
 * right. `API_TARGET` overrides it for the case that the backend runs somewhere else.
 */
const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:8082'

/**
 * Serves the dev server on both loopback addresses, `127.0.0.1` and `::1`.
 *
 * <p>Node binds `localhost` to a single address family — whichever the resolver lists
 * first, here the IPv6 one. Browsers resolve `localhost` to both and may try IPv4 first;
 * on Windows with WSL2 or Docker Desktop a connection attempt on a loopback port nobody
 * listens on is silently dropped instead of refused, so every such attempt stalls for
 * about two seconds before the browser falls back. Firefox spreads parallel requests over
 * both families and paid that stall several times per page turn. A small TCP relay on the
 * loopback address Vite did not bind forwards to the real listener — transparently for
 * HTTP and the HMR websocket — so the first connection attempt succeeds for every client.
 */
function dualLoopback(): Plugin {
  return {
    name: 'dual-loopback',
    apply: 'serve',
    configureServer(server) {
      const httpServer = server.httpServer
      if (!httpServer) return
      httpServer.once('listening', () => {
        const address = httpServer.address()
        if (address === null || typeof address === 'string') return
        const twin =
          address.address === '::1' ? '127.0.0.1'
          : address.address === '127.0.0.1' ? '::1'
          : null
        // A wildcard bind already serves both families.
        if (twin === null) return
        const relay = net.createServer((client) => {
          const upstream = net.connect(address.port, address.address)
          client.pipe(upstream)
          upstream.pipe(client)
          const drop = () => {
            client.destroy()
            upstream.destroy()
          }
          client.on('error', drop)
          upstream.on('error', drop)
        })
        // The twin address being taken is no reason to fail: the primary listener works.
        relay.on('error', () => {})
        relay.listen(address.port, twin)
        httpServer.once('close', () => relay.close())
      })
    },
  }
}

/**
 * Development setup.
 *
 * The backend runs on its own port and has no CORS configuration. Authentication hangs on a
 * session cookie, and a cookie across origins costs more than a proxy is worth. In
 * development the browser therefore only ever sees the Vite server: `/api` is forwarded to
 * Spring unchanged, cookies included.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), dualLoopback()],
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/actuator': { target: API_TARGET, changeOrigin: false },
    },
    // Every screen is a lazy chunk, transformed on first visit. Transforming them while
    // the server is idle takes that wait out of the first click after a restart.
    warmup: {
      clientFiles: ['./src/pages/*.tsx'],
    },
  },
})
