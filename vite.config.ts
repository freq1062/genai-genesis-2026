import { defineConfig } from 'vite'
import type { ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { WebSocketServer } from 'ws'

function arSyncPlugin() {
  let wss: WebSocketServer | null = null;
  return {
    name: 'ar-sync',
    configureServer(server: ViteDevServer) {
      if (!server.httpServer) return;

      wss = new WebSocketServer({ noServer: true });

      wss.on('connection', (ws) => {
        ws.on('message', (data) => {
          // Broadcast to all other active clients
          wss?.clients.forEach((client) => {
            if (client !== ws && client.readyState === 1) { // 1 = OPEN
              client.send(data, { binary: false });
            }
          });
        });
      });

      // Attach to Vite's HTTP server
      server.httpServer.on('upgrade', (request, socket, head) => {
        if (request.url === '/ar-sync') {
          wss?.handleUpgrade(request, socket, head, (ws) => {
            wss?.emit('connection', ws, request);
          });
        }
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    arSyncPlugin()
  ],
  resolve: {
    alias: {
      'hls.js': 'hls.js/dist/hls.js',
    },
  },
  server: {
    allowedHosts: true,
    hmr: false, // Disable HMR to prevent tunnel-reload crashes
    watch: {
      ignored: ['**/backend/**', '**/.venv/**', '**/node_modules/**'],
    },
  }
})
