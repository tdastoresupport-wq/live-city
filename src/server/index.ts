import { GameServer } from './GameServer';

const server = new GameServer();

server
  .startStandalone()
  .then((port) => {
    console.log(`[LIVE CITY SERVER] Authoritative Game Runtime listening on http://${server.getHost()}:${port}`);
    console.log(`[LIVE CITY SERVER] WebSocket Realtime Sync: ws://${server.getHost()}:${port}/ws`);
  })
  .catch((err) => {
    console.error('[LIVE CITY SERVER] Failed to start:', err);
    process.exit(1);
  });

process.on('SIGINT', async () => {
  await server.shutdown();
  process.exit(0);
});
