import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { GameServer } from '../src/server/GameServer';
import { FilePersistenceAdapter } from '../src/core/adapters/FilePersistenceAdapter';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`SMOKE_ASSERTION_FAILED: ${message}`);
  }
}

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'live-city-smoke-'));
  const server = new GameServer({
    host: '127.0.0.1',
    port: 0,
    persistence: new FilePersistenceAdapter(tempDir),
    operatorToken: 'smoke_test_operator_token',
  });

  try {
    const port = await server.startStandalone();
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. Check /api/status + defensive security headers
    const statusRes = await fetch(`${baseUrl}/api/status`);
    assert(statusRes.status === 200, `Expected 200 from /api/status, got ${statusRes.status}`);
    assert(
      statusRes.headers.get('x-content-type-options') === 'nosniff',
      'Missing X-Content-Type-Options: nosniff header'
    );

    // 2. Fetch session token for operator commands
    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Origin: `http://127.0.0.1:${port}` },
    });
    assert(sessionRes.status === 200, `Expected 200 from /api/auth/session, got ${sessionRes.status}`);
    const sessionData = (await sessionRes.json()) as { operatorToken?: string };
    assert(
      sessionData.operatorToken === 'smoke_test_operator_token',
      'Unexpected operator token from /api/auth/session'
    );

    // 3. Connect WebSocket observer & wait for snapshot + state_sync
    const wsMessages: string[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WS snapshot timeout')), 4000);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as { type: string };
        wsMessages.push(msg.type);
        if (msg.type === 'snapshot') {
          clearTimeout(timer);
          resolve();
        }
      };
      ws.onerror = () => reject(new Error('WS error during smoke test'));
    });

    // 4. Negative security checks: query param token -> 400, unauthorized POST -> 401, >64KB -> 413
    const qTokenRes = await fetch(`${baseUrl}/api/status?token=leak`);
    assert(qTokenRes.status === 400, `Expected 400 for query-param token, got ${qTokenRes.status}`);

    const unauthPost = await fetch(`${baseUrl}/api/control/pause`, { method: 'POST' });
    assert(unauthPost.status === 401, `Expected 401 for missing token, got ${unauthPost.status}`);

    const oversizePost = await fetch(`${baseUrl}/api/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-operator-token': 'smoke_test_operator_token',
      },
      body: JSON.stringify({ type: 'comment', comment: 'a'.repeat(70 * 1024) }),
    });
    assert(oversizePost.status === 413, `Expected 413 for >64KB JSON, got ${oversizePost.status}`);

    // 5. Authenticated comment command -> triggers WS state_sync & spawns citizen
    const cmdRes = await fetch(`${baseUrl}/api/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-operator-token': 'smoke_test_operator_token',
      },
      body: JSON.stringify({
        type: 'comment',
        userName: 'SmokeCitizen',
        comment: 'xay',
      }),
    });
    assert(cmdRes.status === 200, `Expected 200 from /api/command, got ${cmdRes.status}`);

    await new Promise((r) => setTimeout(r, 120));
    assert(wsMessages.includes('snapshot'), 'Missing snapshot on WS');
    assert(wsMessages.includes('state_sync'), 'Missing state_sync after command');

    ws.close();
    console.log(
      'LIVE_CITY_SMOKE_PASS:',
      JSON.stringify({ port, wsEvents: wsMessages.length, status: 'OK' })
    );
  } finally {
    await server.shutdown().catch(() => {});
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('SMOKE_TEST_FAILED', err);
  process.exit(1);
});
