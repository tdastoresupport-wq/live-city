process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type * as http from 'node:http';
function liveCityGameServerPlugin(): Plugin {
  let activeInstance: any = null;

  async function attachServer(
    httpServer: http.Server,
    middlewares: {
      use: (fn: (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void) => void;
    }
  ) {
    if (activeInstance) {
      await activeInstance.shutdown().catch(() => {});
      activeInstance = null;
    }

    const { GameServer } = await import('./src/server/GameServer.ts');
    const serverInstance = new GameServer();
    await serverInstance.initAndStartEngine();
    serverInstance.attachToHttpServer(httpServer, middlewares);
    activeInstance = serverInstance;

    httpServer.on('close', () => {
      if (activeInstance === serverInstance) {
        serverInstance.shutdown().catch(() => {});
        activeInstance = null;
      }
    });
  }

  return {
    name: 'live-city-game-server',
    async configureServer(server) {
      if (!server.httpServer) return;
      await attachServer(server.httpServer as http.Server, server.middlewares);
    },
    async configurePreviewServer(server) {
      if (!server.httpServer) return;
      await attachServer(server.httpServer as http.Server, server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), liveCityGameServerPlugin()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    open: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    open: false,
  },
});
