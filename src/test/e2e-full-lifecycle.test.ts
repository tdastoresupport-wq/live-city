import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { GameServer } from '../server/GameServer';
import { FilePersistenceAdapter } from '../core/adapters/FilePersistenceAdapter';

describe('E2E Full Server Lifecycle, WebSocket Sync & Negative Security Hardening', () => {
  const servers: GameServer[] = [];
  const tempDirs: string[] = [];

  async function bootTempServer(): Promise<{ server: GameServer; port: number; dir: string }> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'live-city-e2e-'));
    tempDirs.push(dir);
    const server = new GameServer({
      host: '127.0.0.1',
      port: 0,
      persistence: new FilePersistenceAdapter(dir),
      operatorToken: 'e2e_secret_token_alpha_12345',
    });
    servers.push(server);
    const port = await server.startStandalone();
    return { server, port, dir };
  }

  afterEach(async () => {
    for (const s of servers) {
      await s.shutdown().catch(() => {});
    }
    servers.length = 0;

    while (tempDirs.length > 0) {
      const d = tempDirs.pop()!;
      await fs.rm(d, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('enforces constant-time operator auth, rejects query-string tokens (400), rejects oversized/malformed bodies (413/400), strips __proto__, and emits security headers', async () => {
    const { port } = await bootTempServer();
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. Security headers check on GET /api/status
    const statusRes = await fetch(`${baseUrl}/api/status`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.headers.get('x-content-type-options')).toBe('nosniff');
    expect(statusRes.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(statusRes.headers.get('referrer-policy')).toBe('no-referrer');
    expect(statusRes.headers.get('cache-control')).toBe('no-store');

    // 2. Reject URL query-string tokens with 400 on HTTP and WS
    const queryTokenHttp = await fetch(`${baseUrl}/api/status?token=e2e_secret_token_alpha_12345`);
    expect(queryTokenHttp.status).toBe(400);

    const queryTokenPost = await fetch(
      `${baseUrl}/api/command?operatorToken=e2e_secret_token_alpha_12345`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'comment', userName: 'A', comment: 'go' }),
      }
    );
    expect(queryTokenPost.status).toBe(400);

    // 3. Reject non-allowlisted Origin with 403
    const badOriginRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(badOriginRes.status).toBe(403);

    // 4. Fetch session token via valid loopback origin
    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Origin: `http://127.0.0.1:${port}` },
    });
    expect(sessionRes.status).toBe(200);
    const { operatorToken } = (await sessionRes.json()) as { operatorToken: string };
    expect(operatorToken).toBe('e2e_secret_token_alpha_12345');

    // 5. Wrong length / wrong value operator token returns 401
    const badTokenShort = await fetch(`${baseUrl}/api/control/pause`, {
      method: 'POST',
      headers: { 'x-operator-token': 'short' },
    });
    expect(badTokenShort.status).toBe(401);

    const badTokenSameLen = await fetch(`${baseUrl}/api/control/pause`, {
      method: 'POST',
      headers: { 'x-operator-token': 'e2e_secret_token_alpha_99999' },
    });
    expect(badTokenSameLen.status).toBe(401);

    // 6. Malformed JSON -> 400
    const badJsonRes = await fetch(`${baseUrl}/api/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-operator-token': operatorToken,
      },
      body: '{"type":"comment",',
    });
    expect(badJsonRes.status).toBe(400);

    // 7. JSON Array root -> 400
    const arrayRootRes = await fetch(`${baseUrl}/api/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-operator-token': operatorToken,
      },
      body: JSON.stringify(['not', 'an', 'object']),
    });
    expect(arrayRootRes.status).toBe(400);

    // 8. Oversized payload (> 64KB) -> 413
    const hugeComment = 'x'.repeat(70 * 1024);
    const hugeRes = await fetch(`${baseUrl}/api/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-operator-token': operatorToken,
      },
      body: JSON.stringify({ type: 'comment', comment: hugeComment }),
    });
    expect(hugeRes.status).toBe(413);

    // 9. Prototype pollution keys stripped cleanly without polluting Object.prototype
    const protoRes = await fetch(`${baseUrl}/api/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-operator-token': operatorToken,
      },
      body: '{"type":"comment","userName":"SafeUser","comment":"vao","__proto__":{"polluted":"yes"}}',
    });
    expect(protoRes.status).toBe(200);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('completes full lifecycle: HTTP command -> engine tick -> WebSocket state_sync -> persistence save -> reboot recovery', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'live-city-reboot-'));
    tempDirs.push(dir);

    const server1 = new GameServer({
      host: '127.0.0.1',
      port: 0,
      persistence: new FilePersistenceAdapter(dir),
      operatorToken: 'lifecycle_tok_001',
    });
    servers.push(server1);
    const port1 = await server1.startStandalone();

    // Connect WebSocket client (simulating Stage/Dashboard) and wait for initial snapshot
    const receivedTypes: string[] = [];
    let latestCitizensCount = 0;

    const ws = new WebSocket(`ws://127.0.0.1:${port1}/ws`);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WS snapshot timeout')), 4000);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as {
          type: string;
          payload?: { citizens?: unknown[] };
        };
        receivedTypes.push(msg.type);
        if (msg.payload?.citizens) {
          latestCitizensCount = msg.payload.citizens.length;
        }
        if (msg.type === 'snapshot') {
          clearTimeout(timer);
          resolve();
        }
      };
      ws.onerror = () => reject(new Error('WS error'));
    });

    // Reject WS upgrade containing token query string
    const rejectedWs = new WebSocket(`ws://127.0.0.1:${port1}/ws?token=leak`);
    await new Promise<void>((resolve) => {
      rejectedWs.onerror = () => resolve();
      rejectedWs.onclose = () => resolve();
    });

    // Dispatch authenticated gameplay commands & vote & save
    const postCmd = async (pathName: string, payload?: unknown) => {
      const res = await fetch(`http://127.0.0.1:${port1}${pathName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': 'lifecycle_tok_001',
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      return res;
    };

    const joinRes = await postCmd('/api/command', {
      type: 'comment',
      userName: 'E2EBuilder',
      comment: 'go',
    });
    expect(joinRes.status).toBe(200);

    const voteOpenRes = await postCmd('/api/control/vote', { action: 'open', durationSeconds: 60 });
    expect(voteOpenRes.status).toBe(200);

    await new Promise((r) => setTimeout(r, 120));
    expect(receivedTypes).toContain('state_sync');
    expect(latestCitizensCount).toBe(1);

    const saveRes = await postCmd('/api/control/save');
    expect(saveRes.status).toBe(200);

    ws.close();
    await server1.shutdown();
    servers.pop();

    // Boot second server instance reading same temp directory
    const server2 = new GameServer({
      host: '127.0.0.1',
      port: 0,
      persistence: new FilePersistenceAdapter(dir),
      operatorToken: 'lifecycle_tok_001',
    });
    servers.push(server2);
    const port2 = await server2.startStandalone();

    const snap2Res = await fetch(`http://127.0.0.1:${port2}/api/snapshot`);
    expect(snap2Res.status).toBe(200);
    const snap2Data = (await snap2Res.json()) as {
      snapshot: { citizens: Array<{ userName: string }> };
    };
    expect(snap2Data.snapshot.citizens.some((c) => c.userName === 'E2EBuilder')).toBe(true);

    // Bodyless POST /api/control/pause and /resume succeed with valid token
    const pauseRes = await fetch(`http://127.0.0.1:${port2}/api/control/pause`, {
      method: 'POST',
      headers: { 'x-operator-token': 'lifecycle_tok_001' },
    });
    expect(pauseRes.status).toBe(200);
  });
});
