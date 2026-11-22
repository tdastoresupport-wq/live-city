import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type * as http from 'node:http';

function liveCityGameServerPlugin(): Plugin {
  let shutdownFn: (() => Promise<void>) | null = null;

  return {
    name: 'live-city-game-server',
    async configureServer(server) {
      if (!server.httpServer) return;
      const mod = await server.ssrLoadModule('/src/server/GameServer.ts');
      const GameServerClass = mod.GameServer;
      const instance = new GameServerClass();
      await instance.initAndStartEngine();
      instance.attachToHttpServer(server.httpServer as http.Server, server.middlewares);
      shutdownFn = () => instance.shutdown();
    },
    async closeBundle() {
      if (shutdownFn) {
        await shutdownFn();
        shutdownFn = null;
      }
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
