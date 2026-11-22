import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import {
  WebSocketBridgeTransport,
  validateBridgeUrl,
  validateBridgeUrlAsync,
} from '../core/adapters/WebSocketBridgeTransport';
import { TikTokLiveAdapter } from '../core/adapters/TikTokLiveAdapter';
import { GameServer } from '../server/GameServer';
import { LocalStoragePersistence } from '../core/adapters/LocalStoragePersistence';
import { upgradeToWebSocket, WsClient } from '../server/wsProtocol';
import * as dns from 'node:dns';

class MockBridgeServer {
  public server: http.Server | null = null;
  public clients: Set<WsClient> = new Set();
  public port = 0;
  public lastSubscribeMessage: any = null;
  public mode: 'correct_ack' | 'wrong_channel_ack' | 'error_ack' | 'generic_connected_only' | 'no_ack' =
    'correct_ack';
  public customAckChannel = '';

  public async start(forcedPort = 0): Promise<number> {
    this.server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end('OK');
    });

    this.server.on('upgrade', (req, socket) => {
      const client = upgradeToWebSocket(
        req,
        socket,
        (c, text) => {
          try {
            const parsed = JSON.parse(text);
            this.lastSubscribeMessage = parsed;

            if (this.mode === 'error_ack') {
              c.send({
                action: 'ack',
                status: 'error',
                message: 'Channel is offline',
                channelId: parsed.channelId,
              });
            } else if (this.mode === 'wrong_channel_ack') {
              c.send({
                action: 'ack',
                status: 'subscribed',
                channelId: this.customAckChannel || '@completely_different_channel',
              });
            } else if (this.mode === 'generic_connected_only') {
              c.send({ type: 'connected', timestamp: Date.now() });
            } else if (this.mode === 'no_ack') {
              // Silently ignore handshake
            } else {
              // 'correct_ack'
              c.send({
                action: 'ack',
                status: 'subscribed',
                channelId: parsed.channelId,
              });
            }
          } catch {
            // ignore
          }
        },
        (c) => {
          this.clients.delete(c);
        }
      );
      if (client) this.clients.add(client);
    });

    return new Promise((resolve) => {
      this.server!.listen(forcedPort, '127.0.0.1', () => {
        this.port = (this.server!.address() as any).port;
        resolve(this.port);
      });
    });
  }

  public emitPayload(payload: any): void {
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const client of this.clients) {
      client.send(json);
    }
  }

  public async stop(): Promise<void> {
    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
  }
}

describe('Post-Bridge Security & ACK Contract Hardening Test Matrix', () => {
  let bridgeServer: MockBridgeServer;
  let bridgePort = 0;

  beforeEach(async () => {
    bridgeServer = new MockBridgeServer();
    bridgePort = await bridgeServer.start();
  });

  afterEach(async () => {
    await bridgeServer.stop();
  });

  // -------------------------------------------------------------
  // Test 1: Origin allowlisted
  // -------------------------------------------------------------
  it('1. Origin allowlisted: should accept requests from Vite Dev origin (5173)', async () => {
    const server = new GameServer({
      port: 0,
      host: '127.0.0.1',
      persistence: new LocalStoragePersistence('sec_test_1_'),
      operatorToken: 'token_1',
    });
    const port = await server.startStandalone();

    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    await server.shutdown();
  });

  // -------------------------------------------------------------
  // Test 2: Origin localhost with unfamiliar port rejected
  // -------------------------------------------------------------
  it('2. Origin localhost with unfamiliar port rejected: should reject http://localhost:8888 with 403', async () => {
    const server = new GameServer({
      port: 0,
      host: '127.0.0.1',
      persistence: new LocalStoragePersistence('sec_test_2_'),
      operatorToken: 'token_2',
    });
    const port = await server.startStandalone();

    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      headers: { Origin: 'http://localhost:8888' },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('allowlist');

    await server.shutdown();
  });

  // -------------------------------------------------------------
  // Test 3: Origin outside allowlist rejected
  // -------------------------------------------------------------
  it('3. Origin outside allowlist rejected: should reject cross-origin malicious origin with 403', async () => {
    const server = new GameServer({
      port: 0,
      host: '127.0.0.1',
      persistence: new LocalStoragePersistence('sec_test_3_'),
      operatorToken: 'token_3',
    });
    const port = await server.startStandalone();

    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      headers: { Origin: 'http://evil-attacker.com' },
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();

    await server.shutdown();
  });

  // -------------------------------------------------------------
  // Test 4: Session bootstrap does not leak operator token to unauthorized origin
  // -------------------------------------------------------------
  it('4. Session bootstrap does not leak operator token to unauthorized origin or null origin', async () => {
    const server = new GameServer({
      port: 0,
      host: '127.0.0.1',
      persistence: new LocalStoragePersistence('sec_test_4_'),
      operatorToken: 'secret_operator_key_999',
    });
    const port = await server.startStandalone();

    // 4a. Unfamiliar localhost port
    const resUnauthorized = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
      headers: { Origin: 'http://localhost:9999' },
    });
    expect(resUnauthorized.status).toBe(403);
    const bodyUnauth = (await resUnauthorized.json()) as any;
    expect(bodyUnauth.operatorToken).toBeUndefined();

    // 4b. Sandboxed iframe / null origin
    const resNull = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
      headers: { Origin: 'null' },
    });
    expect(resNull.status).toBe(403);

    // 4c. Allowed origin succeeds
    const resAllowed = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
      headers: { Origin: 'http://127.0.0.1:5173' },
    });
    expect(resAllowed.status).toBe(200);
    const bodyAllowed = (await resAllowed.json()) as any;
    expect(bodyAllowed.operatorToken).toBe('secret_operator_key_999');

    await server.shutdown();
  });

  // -------------------------------------------------------------
  // Test 5: Bridge URL with invalid scheme, fragment, credentials
  // -------------------------------------------------------------
  it('5. Bridge URL with invalid scheme, fragment, or credentials should be rejected', () => {
    expect(validateBridgeUrl('http://127.0.0.1:21213').valid).toBe(false);
    expect(validateBridgeUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateBridgeUrl('ftp://127.0.0.1:21213').valid).toBe(false);
    expect(validateBridgeUrl('').valid).toBe(false);
    expect(validateBridgeUrl('ws://127.0.0.1:21213#fragment').valid).toBe(false);
    expect(validateBridgeUrl('ws://admin:secret@127.0.0.1:21213').valid).toBe(false);
    expect(validateBridgeUrl('ws://127.0.0.1:99999').valid).toBe(false);
  });

  // -------------------------------------------------------------
  // Test 6: Private IP / link-local / IPv6 / internal hostname rejected
  // -------------------------------------------------------------
  it('6. Private IP / link-local / IPv6 / internal hostname must be rejected for remote bridges', () => {
    expect(validateBridgeUrl('ws://10.0.0.1:8080').valid).toBe(false);
    expect(validateBridgeUrl('ws://192.168.1.1:8080').valid).toBe(false);
    expect(validateBridgeUrl('ws://172.16.5.1:8080').valid).toBe(false);
    expect(validateBridgeUrl('ws://169.254.169.254:80').valid).toBe(false);
    expect(validateBridgeUrl('ws://[fe80::1]:8080').valid).toBe(false);
    expect(validateBridgeUrl('ws://[fc00::1]:8080').valid).toBe(false);
    expect(validateBridgeUrl('ws://[::ffff:169.254.169.254]:80').valid).toBe(false);
    expect(validateBridgeUrl('ws://metadata.google.internal:80').valid).toBe(false);
    expect(validateBridgeUrl('ws://server.local:8080').valid).toBe(false);
    expect(validateBridgeUrl('ws://my-service.internal:8080').valid).toBe(false);
  });

  // -------------------------------------------------------------
  // Test 7: Loopback bridge valid according to policy
  // -------------------------------------------------------------
  it('7. Loopback bridge should be valid under local policy but rejectable if loopback disabled', () => {
    expect(validateBridgeUrl('ws://127.0.0.1:21213').valid).toBe(true);
    expect(validateBridgeUrl('ws://localhost:21213').valid).toBe(true);
    expect(validateBridgeUrl('ws://[::1]:21213').valid).toBe(true);

    // If policy explicitly disallows loopback
    expect(validateBridgeUrl('ws://127.0.0.1:21213', { allowLoopback: false }).valid).toBe(false);
  });

  // -------------------------------------------------------------
  // Test 8: DNS hostname resolving to forbidden address (SSRF / DNS rebinding)
  // -------------------------------------------------------------
  it('8. DNS hostname resolving to forbidden address should be rejected before connection', async () => {
    // Spy on dns.promises.lookup to simulate a domain resolving to private IP 10.0.0.1
    const lookupSpy = vi.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
      { address: '10.0.0.1', family: 4 },
    ] as any);

    const result = await validateBridgeUrlAsync('wss://rebind-attack.example.com/live');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('resolves to forbidden IP');

    lookupSpy.mockRestore();
  });

  // -------------------------------------------------------------
  // Test 9: ACK with correct channel
  // -------------------------------------------------------------
  it('9. ACK with correct channel marks subscriptionVerified: true', async () => {
    bridgeServer.mode = 'correct_ack';
    const transport = new WebSocketBridgeTransport();

    await transport.connect('@streamer_official', `ws://127.0.0.1:${bridgePort}`, {
      requireAck: true,
      ackTimeoutMs: 1000,
    });

    expect(transport.isSocketConnected()).toBe(true);
    expect(transport.isSubscriptionVerified()).toBe(true);

    await transport.disconnect();
  });

  // -------------------------------------------------------------
  // Test 10: ACK with wrong channel
  // -------------------------------------------------------------
  it('10. ACK with wrong channel must be rejected', async () => {
    bridgeServer.mode = 'wrong_channel_ack';
    bridgeServer.customAckChannel = '@some_other_room';
    const transport = new WebSocketBridgeTransport();

    await expect(
      transport.connect('@expected_streamer', `ws://127.0.0.1:${bridgePort}`, {
        requireAck: true,
        ackTimeoutMs: 500,
      })
    ).rejects.toThrow(/Subscription ACK channel mismatch/);

    expect(transport.isSubscriptionVerified()).toBe(false);
    await transport.disconnect();
  });

  // -------------------------------------------------------------
  // Test 11: Generic connected does NOT mark subscription verified
  // -------------------------------------------------------------
  it('11. Generic connected frame does NOT mark subscription verified', async () => {
    bridgeServer.mode = 'generic_connected_only';
    const transport = new WebSocketBridgeTransport();

    // When requireAck is false, connection opens as unverified
    await transport.connect('@streamer', `ws://127.0.0.1:${bridgePort}`, {
      requireAck: false,
    });

    expect(transport.isSocketConnected()).toBe(true);
    expect(transport.isSubscriptionVerified()).toBe(false);

    await transport.disconnect();
  });

  // -------------------------------------------------------------
  // Test 12: ACK with error does not mark success
  // -------------------------------------------------------------
  it('12. ACK with error does not mark success and rejects connection', async () => {
    bridgeServer.mode = 'error_ack';
    const transport = new WebSocketBridgeTransport();

    await expect(
      transport.connect('@offline_user', `ws://127.0.0.1:${bridgePort}`, {
        requireAck: true,
        ackTimeoutMs: 500,
      })
    ).rejects.toThrow(/Channel is offline/);

    expect(transport.isSubscriptionVerified()).toBe(false);
    await transport.disconnect();
  });

  // -------------------------------------------------------------
  // Test 13: ACK timeout
  // -------------------------------------------------------------
  it('13. ACK timeout: when requireAck is true, rejects connection if no ACK arrives within timeout', async () => {
    bridgeServer.mode = 'no_ack';
    const transport = new WebSocketBridgeTransport();

    await expect(
      transport.connect('@silent_bridge', `ws://127.0.0.1:${bridgePort}`, {
        requireAck: true,
        ackTimeoutMs: 150,
      })
    ).rejects.toThrow(/Bridge handshake acknowledgement timed out: subscribe unverified/);

    expect(transport.isSubscriptionVerified()).toBe(false);
    await transport.disconnect();
  });

  // -------------------------------------------------------------
  // Test 14: Reconnect after bridge drop
  // -------------------------------------------------------------
  it('14. Reconnect after bridge drop: reconnects using exponential backoff', async () => {
    const adapter = new TikTokLiveAdapter({
      channelId: '@resilient_channel',
      bridgeUrl: `ws://127.0.0.1:${bridgePort}`,
      baseBackoffMs: 40,
      maxReconnectAttempts: 4,
    });

    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);

    // Stop bridge
    await bridgeServer.stop();
    await new Promise((r) => setTimeout(r, 60));
    expect(adapter.getConnectionState().status).toBe('reconnecting');

    // Restart bridge on same port
    bridgeServer = new MockBridgeServer();
    await bridgeServer.start(bridgePort);

    // Wait for backoff retry
    await new Promise((r) => setTimeout(r, 150));
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getConnectionState().status).toBe('connected');

    await adapter.disconnect();
  });

  // -------------------------------------------------------------
  // Test 15: Manual disconnect does not reconnect
  // -------------------------------------------------------------
  it('15. Manual disconnect does not reconnect and clears active timers', async () => {
    const adapter = new TikTokLiveAdapter({
      channelId: '@manual_channel',
      bridgeUrl: `ws://127.0.0.1:${bridgePort}`,
      baseBackoffMs: 30,
    });

    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
    expect(adapter.getConnectionState().status).toBe('disconnected');

    // Wait a backoff window to verify no spontaneous reconnect happens
    await new Promise((r) => setTimeout(r, 80));
    expect(adapter.getConnectionState().status).toBe('disconnected');
  });

  // -------------------------------------------------------------
  // Test 16: Changing bridge URL leaves no old sockets
  // -------------------------------------------------------------
  it('16. Changing bridge URL leaves no old sockets or connection leaks', async () => {
    const bridge2 = new MockBridgeServer();
    const port2 = await bridge2.start();

    const transport = new WebSocketBridgeTransport();
    await transport.connect('@streamer', `ws://127.0.0.1:${bridgePort}`);
    expect(bridgeServer.clients.size).toBe(1);

    // Switch endpoint to bridge2
    await transport.connect('@streamer', `ws://127.0.0.1:${port2}`);
    expect(bridge2.clients.size).toBe(1);

    // Ensure bridge 1 has 0 clients left
    await new Promise((r) => setTimeout(r, 50));
    expect(bridgeServer.clients.size).toBe(0);

    await transport.disconnect();
    await bridge2.stop();
  });

  // -------------------------------------------------------------
  // Test 17: Single event processed only once (idempotent, deduplicated)
  // -------------------------------------------------------------
  it('17. Single event processed only once and duplicate is rejected by deduplicator', async () => {
    const server = new GameServer({
      port: 0,
      host: '127.0.0.1',
      persistence: new LocalStoragePersistence('idempotent_test_'),
      operatorToken: 'op_idempotent',
    });
    await server.startStandalone();

    const now = Date.now();
    const eventPayload = {
      type: 'comment' as const,
      eventId: 'evt_idempotent_123',
      userId: 'user_idem_456',
      nickname: 'IdemUser',
      comment: 'VÀO',
      timestamp: now,
    };

    // First ingestion
    const firstAccepted = server.tiktokAdapter.handleIncomingPayload(eventPayload);
    expect(firstAccepted).toBe(true);
    expect(server.engine.worldState.citizens.size).toBe(1);

    // Duplicate ingestion with same eventId
    const secondAccepted = server.tiktokAdapter.handleIncomingPayload(eventPayload);
    expect(secondAccepted).toBe(false);
    expect(server.engine.worldState.citizens.size).toBe(1);

    await server.shutdown();
  });

  // -------------------------------------------------------------
  // Test 18: Regression for Dashboard and OBS
  // -------------------------------------------------------------
  it('18. Regression for Dashboard and OBS: Dashboard gets operator token; OBS Stage connects and syncs', async () => {
    const server = new GameServer({
      port: 0,
      host: '127.0.0.1',
      persistence: new LocalStoragePersistence('dash_obs_reg_'),
      operatorToken: 'token_dash_obs_123',
    });
    const serverPort = await server.startStandalone();

    // 18a. Dashboard from allowed origin bootstraps operator session
    const dashRes = await fetch(`http://127.0.0.1:${serverPort}/api/auth/session`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(dashRes.status).toBe(200);
    const dashData = (await dashRes.json()) as any;
    expect(dashData.operatorToken).toBe('token_dash_obs_123');

    // 18b. OBS Stage observer reads status and snapshot without operator token
    const obsStatusRes = await fetch(`http://127.0.0.1:${serverPort}/api/status`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(obsStatusRes.status).toBe(200);
    const obsStatus = (await obsStatusRes.json()) as any;
    expect(obsStatus.status).toBe('ok');
    expect(obsStatus.engineRunning).toBe(true);

    const obsSnapRes = await fetch(`http://127.0.0.1:${serverPort}/api/snapshot`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(obsSnapRes.status).toBe(200);
    const obsSnap = (await obsSnapRes.json()) as any;
    expect(obsSnap.snapshot).toBeDefined();

    await server.shutdown();
  });
});
