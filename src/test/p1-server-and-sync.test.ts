import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameServer } from '../server/GameServer';
import { LocalStoragePersistence } from '../core/adapters/LocalStoragePersistence';

describe('P1 Local Game Server, Security & Realtime State Sync', () => {
  let server: GameServer;
  let port: number;
  let baseUrl: string;
  let sharedPersistence: LocalStoragePersistence;

  beforeEach(async () => {
    sharedPersistence = new LocalStoragePersistence('test_server_');
    await sharedPersistence.clear();
    server = new GameServer({
      port: 0, // ephemeral port on 127.0.0.1
      host: '127.0.0.1',
      persistence: sharedPersistence,
      operatorToken: 'test_secret_operator_token_123',
    });
    port = await server.startStandalone();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    if (server) {
      await server.shutdown();
    }
  });

  it('should bind to 127.0.0.1 and report runtime status and initial snapshot', async () => {
    const statusRes = await fetch(`${baseUrl}/api/status`);
    expect(statusRes.status).toBe(200);
    const statusData = (await statusRes.json()) as {
      status: string;
      engineRunning: boolean;
      citizensCount: number;
    };
    expect(statusData.status).toBe('ok');
    expect(statusData.engineRunning).toBe(true);
    expect(statusData.citizensCount).toBe(0);

    const snapRes = await fetch(`${baseUrl}/api/snapshot`);
    expect(snapRes.status).toBe(200);
    const snapData = (await snapRes.json()) as {
      snapshot: { version: number; resources: { wood: number } };
    };
    expect(snapData.snapshot.version).toBe(2);
    expect(snapData.snapshot.resources.wood).toBe(120);
  });

  it('should enforce operator token and reject unauthorized or foreign-origin requests', async () => {
    // 1. Missing token -> 401
    const unauthRes = await fetch(`${baseUrl}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'comment', comment: 'VÀO', userName: 'Hacker' }),
    });
    expect(unauthRes.status).toBe(401);

    // 2. Foreign Origin -> 403
    const foreignOriginRes = await fetch(`${baseUrl}/api/status`, {
      headers: { Origin: 'https://malicious-site.example.com' },
    });
    expect(foreignOriginRes.status).toBe(403);

    // 3. Reset without confirmation token -> 400
    const badResetRes = await fetch(`${baseUrl}/api/control/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-operator-token': 'test_secret_operator_token_123',
      },
      body: JSON.stringify({ confirm: 'WRONG' }),
    });
    expect(badResetRes.status).toBe(400);
  });

  it('should synchronize state between Operator Dashboard commands and OBS Stage snapshot readers', async () => {
    // Operator Dashboard sends comment command
    const cmdRes = await fetch(`${baseUrl}/api/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-operator-token': 'test_secret_operator_token_123',
      },
      body: JSON.stringify({
        type: 'comment',
        comment: 'GỖ',
        userName: 'ViewerOnStage',
      }),
    });
    expect(cmdRes.status).toBe(200);

    // OBS Stage fetches authoritative state
    const stageSnapRes = await fetch(`${baseUrl}/api/snapshot`);
    const stageData = (await stageSnapRes.json()) as {
      snapshot: {
        citizens: Array<{ userName: string; state: string }>;
      };
    };

    expect(stageData.snapshot.citizens.length).toBe(1);
    expect(stageData.snapshot.citizens[0].userName).toBe('ViewerOnStage');
    expect(stageData.snapshot.citizens[0].state).toBe('moving_to_harvest');
  });

  it('should persist and recover full city state across server restart', async () => {
    // Spawn citizen and add resources on server instance 1
    await fetch(`${baseUrl}/api/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-operator-token': 'test_secret_operator_token_123',
      },
      body: JSON.stringify({
        type: 'comment',
        comment: 'VÀO',
        userName: 'PersistentCitizen',
      }),
    });
    server.engine.worldState.addResource('wood', 250, 'PersistentCitizen');

    // Shutdown server 1 (triggers saveState)
    await server.shutdown();

    // Start server 2 with the same persistence store
    const server2 = new GameServer({
      port: 0,
      host: '127.0.0.1',
      persistence: sharedPersistence,
      operatorToken: 'test_secret_operator_token_123',
    });
    const port2 = await server2.startStandalone();

    try {
      const snapRes = await fetch(`http://127.0.0.1:${port2}/api/snapshot`);
      const data = (await snapRes.json()) as {
        snapshot: {
          resources: { wood: number };
          citizens: Array<{ userName: string }>;
        };
      };
      expect(data.snapshot.resources.wood).toBe(370); // 120 + 250
      expect(data.snapshot.citizens.length).toBe(1);
      expect(data.snapshot.citizens[0].userName).toBe('PersistentCitizen');
    } finally {
      await server2.shutdown();
    }
  });
});
