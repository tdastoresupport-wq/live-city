import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as dns from 'node:dns';
import {
  WebSocketBridgeTransport,
  validateBridgeUrl,
  validateBridgeUrlAsync,
  normalizeChannelId,
} from '../core/adapters/WebSocketBridgeTransport';
import { TikTokLiveAdapter } from '../core/adapters/TikTokLiveAdapter';
import { GameServer } from '../server/GameServer';
import { LocalStoragePersistence } from '../core/adapters/LocalStoragePersistence';
import { upgradeToWebSocket, WsClient } from '../server/wsProtocol';
import { GameRuntimeClient } from '../ui/services/GameRuntimeClient';

/**
 * Lightweight RFC 6455 mock TikTok bridge server for deterministic protocol testing.
 */
class ConfigurableMockBridge {
  public server: http.Server | null = null;
  public clients: Set<WsClient> = new Set();
  public port = 0;
  public lastSubscribeFrame: any = null;
  public onSubscribe: (client: WsClient, frame: any) => void = (client, frame) => {
    client.send({
      action: 'ack',
      status: 'subscribed',
      channelId: frame.channelId,
    });
  };

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
            this.lastSubscribeFrame = parsed;
            this.onSubscribe(c, parsed);
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
        this.port = (this.server!.address() as { port: number }).port;
        resolve(this.port);
      });
    });
  }

  public async stop(): Promise<void> {
    for (const c of this.clients) {
      try {
        c.close();
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

/**
 * Helper: Send raw HTTP request with explicit Host / Origin headers (bypassing fetch header restrictions).
 */
function rawHttpGet(
  port: number,
  path: string,
  headers: Record<string, string>
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body,
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Helper: Minimal RFC 6455 WebSocket upgrade client supporting custom Origin and Host headers.
 */
function openRawWsClient(
  port: number,
  headers: Record<string, string>
): Promise<{
  statusCode: number;
  messages: any[];
  waitForMessage: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/ws',
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key,
        ...headers,
      },
    });

    const messages: any[] = [];
    const waiters: Array<{
      predicate: (msg: any) => boolean;
      resolve: (msg: any) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }> = [];

    const pushMessage = (msg: any) => {
      messages.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(msg)) {
          clearTimeout(waiters[i].timer);
          const w = waiters.splice(i, 1)[0];
          w.resolve(msg);
        }
      }
    };

    const waitForMessage = (predicate: (msg: any) => boolean, timeoutMs = 2000): Promise<any> => {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((res, rej) => {
        const timer = setTimeout(() => {
          rej(new Error(`Timed out waiting for WebSocket message (${timeoutMs}ms)`));
        }, timeoutMs);
        waiters.push({ predicate, resolve: res, reject: rej, timer });
      });
    };

    req.on('response', (res) => {
      // Upgrade was rejected (e.g. 403 Forbidden)
      res.resume();
      resolve({
        statusCode: res.statusCode ?? 0,
        messages,
        waitForMessage,
        close: () => req.destroy(),
      });
    });

    req.on('upgrade', (res, socket, head) => {
      let buf = Buffer.alloc(0);

      const parseFrames = (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 2) {
          const opcode = buf[0] & 0x0f;
          const masked = (buf[1] & 0x80) !== 0;
          let payloadLen = buf[1] & 0x7f;
          let offset = 2;

          if (payloadLen === 126) {
            if (buf.length < 4) return;
            payloadLen = buf.readUInt16BE(2);
            offset = 4;
          } else if (payloadLen === 127) {
            if (buf.length < 10) return;
            payloadLen = Number(buf.readBigUInt64BE(2));
            offset = 10;
          }

          const maskLen = masked ? 4 : 0;
          if (buf.length < offset + maskLen + payloadLen) return;

          const payload = buf.subarray(offset + maskLen, offset + maskLen + payloadLen);
          buf = buf.subarray(offset + maskLen + payloadLen);

          if (opcode === 0x1) {
            try {
              pushMessage(JSON.parse(payload.toString('utf8')));
            } catch {
              // ignore
            }
          }
        }
      };

      if (head && head.length > 0) {
        parseFrames(head);
      }
      socket.on('data', parseFrames);

      resolve({
        statusCode: res.statusCode ?? 101,
        messages,
        waitForMessage,
        close: () => {
          for (const w of waiters) clearTimeout(w.timer);
          socket.destroy();
        },
      });
    });

    req.on('error', reject);
    req.end();
  });
}

describe('Final Security Regression Patch — Complete Verification Matrix', () => {
  let bridge: ConfigurableMockBridge;
  let bridgePort = 0;

  beforeEach(async () => {
    bridge = new ConfigurableMockBridge();
    bridgePort = await bridge.start();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await bridge.stop();
  });

  // =========================================================================
  // 1. P0 — STRICT ACK MUST BE STRICT
  // =========================================================================
  describe('1. P0 — Strict Subscription ACK Contract', () => {
    it('ACK missing channel: rejected in strict mode and stays unverified in non-strict mode', async () => {
      bridge.onSubscribe = (client) => {
        client.send({ action: 'ack', status: 'subscribed' }); // missing channelId!
      };

      // Strict mode MUST reject
      const strictTransport = new WebSocketBridgeTransport();
      await expect(
        strictTransport.connect('@live_room', `ws://127.0.0.1:${bridgePort}`, {
          requireAck: true,
          ackTimeoutMs: 500,
        })
      ).rejects.toThrow(/missing required channel identifier/i);
      expect(strictTransport.isSubscriptionVerified()).toBe(false);
      await strictTransport.disconnect();

      // Non-strict mode MUST NOT falsely mark subscriptionVerified
      const looseTransport = new WebSocketBridgeTransport();
      await looseTransport.connect('@live_room', `ws://127.0.0.1:${bridgePort}`, {
        requireAck: false,
      });
      expect(looseTransport.isSocketConnected()).toBe(true);
      expect(looseTransport.isSubscriptionVerified()).toBe(false);
      await looseTransport.disconnect();
    });

    it('ACK correct channel: accepts direct channelId, data.channelId, and data.uniqueId', async () => {
      // 1a. Direct channelId with case difference
      bridge.onSubscribe = (client) => {
        client.send({ action: 'ack', status: 'subscribed', channelId: 'My_Streamer' });
      };
      const t1 = new WebSocketBridgeTransport();
      await t1.connect('@my_streamer', `ws://127.0.0.1:${bridgePort}`, {
        requireAck: true,
        ackTimeoutMs: 500,
      });
      expect(t1.isSubscriptionVerified()).toBe(true);
      await t1.disconnect();

      // 1b. Nested data.channelId
      bridge.onSubscribe = (client) => {
        client.send({ action: 'ack', status: 'subscribed', data: { channelId: '@MY_STREAMER' } });
      };
      const t2 = new WebSocketBridgeTransport();
      await t2.connect('my_streamer', `ws://127.0.0.1:${bridgePort}`, {
        requireAck: true,
        ackTimeoutMs: 500,
      });
      expect(t2.isSubscriptionVerified()).toBe(true);
      await t2.disconnect();

      // 1c. Nested data.uniqueId
      bridge.onSubscribe = (client) => {
        client.send({ event: 'subscribed', data: { uniqueId: '  @my_streamer  ' } });
      };
      const t3 = new WebSocketBridgeTransport();
      await t3.connect('@my_streamer', `ws://127.0.0.1:${bridgePort}`, {
        requireAck: true,
        ackTimeoutMs: 500,
      });
      expect(t3.isSubscriptionVerified()).toBe(true);
      await t3.disconnect();
    });

    it('ACK wrong channel: rejects direct and nested channel mismatches', async () => {
      bridge.onSubscribe = (client) => {
        client.send({
          action: 'ack',
          status: 'subscribed',
          data: { uniqueId: '@wrong_streamer' },
        });
      };
      const transport = new WebSocketBridgeTransport();
      await expect(
        transport.connect('@target_streamer', `ws://127.0.0.1:${bridgePort}`, {
          requireAck: true,
          ackTimeoutMs: 500,
        })
      ).rejects.toThrow(/channel mismatch/i);
      expect(transport.isSubscriptionVerified()).toBe(false);
      await transport.disconnect();
    });

    it('ACK wrong channel normalization: rejects double-@, bare @, whitespace, and path suffixes', async () => {
      expect(normalizeChannelId('@Streamer_01')).toBe('streamer_01');
      expect(normalizeChannelId('  @STREAMER_01  ')).toBe('streamer_01');
      expect(normalizeChannelId('@@streamer_01')).toBe('');
      expect(normalizeChannelId('@')).toBe('');
      expect(normalizeChannelId('   ')).toBe('');
      expect(normalizeChannelId('@streamer_01/live')).toBe('');
      expect(normalizeChannelId('@streamer_01?room=1')).toBe('');
      expect(normalizeChannelId({ channelId: '@streamer_01' })).toBe('');

      const malformedChannels = ['@@target_streamer', '@', '   ', '@target_streamer/live'];
      for (const badChannel of malformedChannels) {
        bridge.onSubscribe = (client) => {
          client.send({ action: 'ack', status: 'subscribed', channelId: badChannel });
        };
        const transport = new WebSocketBridgeTransport();
        await expect(
          transport.connect('@target_streamer', `ws://127.0.0.1:${bridgePort}`, {
            requireAck: true,
            ackTimeoutMs: 500,
          })
        ).rejects.toThrow(/invalid channel identifier/i);
        expect(transport.isSubscriptionVerified()).toBe(false);
        await transport.disconnect();
      }
    });

    it('Generic ok/success/connected and ordinary comment payloads do NOT satisfy strict ACK', async () => {
      const receivedEvents: any[] = [];
      bridge.onSubscribe = (client, frame) => {
        // Send generic frames and a comment payload, but NO valid subscribed ACK
        client.send({ type: 'connected', channelId: frame.channelId });
        client.send({ action: 'ack', status: 'ok', channelId: frame.channelId });
        client.send({ status: 'success', channelId: frame.channelId });
        client.send({
          type: 'comment',
          eventId: 'premature_evt_1',
          userId: 'u_1',
          nickname: 'Viewer',
          comment: 'VÀO',
          timestamp: Date.now(),
        });
      };

      const transport = new WebSocketBridgeTransport();
      transport.onMessage((p) => receivedEvents.push(p));

      await expect(
        transport.connect('@strict_room', `ws://127.0.0.1:${bridgePort}`, {
          requireAck: true,
          ackTimeoutMs: 200,
        })
      ).rejects.toThrow(/timed out: subscribe unverified/i);

      expect(transport.isSubscriptionVerified()).toBe(false);
      expect(receivedEvents.length).toBe(0);
      await transport.disconnect();
    });
  });

  // =========================================================================
  // 2. P0 — PRESERVE REQUIRE ACK ACROSS RECONNECT
  // =========================================================================
  describe('2. P0 — Preserve requireAck Across Reconnect & URL Changes', () => {
    it('Strict ACK retained after reconnect & times out when new bridge omits ACK (6-step integration)', async () => {
      // Server starts with requireAck=false default; Dashboard explicitly passes requireAck=true!
      const server = new GameServer({
        port: 0,
        host: '127.0.0.1',
        persistence: new LocalStoragePersistence('strict_reconn_test_'),
        operatorToken: 'reconn_op_token',
        requireAck: false,
        ackTimeoutMs: 180,
      });
      // Speed up backoff for deterministic test execution
      (server.tiktokAdapter as any).options.baseBackoffMs = 40;
      (server.tiktokAdapter as any).options.maxReconnectAttempts = 2;

      const serverPort = await server.startStandalone();

      // Step 1: Dashboard connects with requireAck=true
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/live/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': 'reconn_op_token',
        },
        body: JSON.stringify({
          platform: 'tiktok_experimental',
          channelId: '@persist_ack_channel',
          bridgeUrl: `ws://127.0.0.1:${bridgePort}`,
          requireAck: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { ok: boolean; liveConnection: any };
      // Step 2: Bridge confirms ACK -> connected & verified
      expect(data.ok).toBe(true);
      expect(data.liveConnection.status).toBe('connected');
      expect(data.liveConnection.subscriptionVerified).toBe(true);
      expect(server.tiktokAdapter.getRequireAck()).toBe(true);

      // Step 3: Bridge drops connection
      await bridge.stop();
      await new Promise((r) => setTimeout(r, 40));
      expect(server.tiktokAdapter.getConnectionState().status).toBe('reconnecting');
      expect(server.tiktokAdapter.getConnectionState().subscriptionVerified).toBe(false);

      // Step 4 & 5: New bridge starts on same port, but sends NO ACK
      bridge = new ConfigurableMockBridge();
      bridge.onSubscribe = () => {
        // Silent bridge — sends no ACK!
      };
      await bridge.start(bridgePort);

      // Wait for backoff reconnect + ACK timeout retries to exhaust
      await new Promise((r) => setTimeout(r, 650));

      // Step 6: Adapter MUST still enforce strict ACK and MUST NOT report verified or connected
      const finalState = server.tiktokAdapter.getConnectionState();
      expect(server.tiktokAdapter.getRequireAck()).toBe(true);
      expect(finalState.subscriptionVerified).toBe(false);
      expect(finalState.status).not.toBe('connected');
      expect(finalState.errorMessage).toMatch(/timed out: subscribe unverified/i);

      await server.shutdown();
    });

    it('requireAck=false optional mode works across reconnect without falsely claiming verified', async () => {
      bridge.onSubscribe = (client) => {
        client.send({ type: 'connected' });
      };

      const adapter = new TikTokLiveAdapter({
        baseBackoffMs: 40,
        maxReconnectAttempts: 3,
      });

      await adapter.connect({
        channelId: '@optional_room',
        bridgeUrl: `ws://127.0.0.1:${bridgePort}`,
        requireAck: false,
      });

      expect(adapter.getConnectionState().status).toBe('connected');
      expect(adapter.getConnectionState().subscriptionVerified).toBe(false);

      // Drop & restart bridge still sending generic connected only
      await bridge.stop();
      await new Promise((r) => setTimeout(r, 35));
      expect(adapter.getConnectionState().status).toBe('reconnecting');

      bridge = new ConfigurableMockBridge();
      bridge.onSubscribe = (client) => {
        client.send({ type: 'connected' });
      };
      await bridge.start(bridgePort);

      await new Promise((r) => setTimeout(r, 300));
      expect(adapter.getConnectionState().status).toBe('connected');
      expect(adapter.getConnectionState().subscriptionVerified).toBe(false);

      await adapter.disconnect();
    });

    it('Changing bridge URL retains requireAck policy when not overridden', async () => {
      const bridge2 = new ConfigurableMockBridge();
      bridge2.onSubscribe = () => {
        // Bridge 2 sends no ACK
      };
      const port2 = await bridge2.start();

      const adapter = new TikTokLiveAdapter({ ackTimeoutMs: 150 });
      await adapter.connect({
        channelId: '@switch_room',
        bridgeUrl: `ws://127.0.0.1:${bridgePort}`,
        requireAck: true,
      });
      expect(adapter.getConnectionState().subscriptionVerified).toBe(true);

      // Switch URL without passing requireAck again -> must still enforce requireAck=true!
      await expect(
        adapter.connect({
          bridgeUrl: `ws://127.0.0.1:${port2}`,
        })
      ).rejects.toThrow(/timed out: subscribe unverified/i);

      expect(adapter.getRequireAck()).toBe(true);
      expect(adapter.getConnectionState().subscriptionVerified).toBe(false);

      await adapter.disconnect();
      await bridge2.stop();
    });
  });

  // =========================================================================
  // 3. P0 — DNS FAILURE MUST NOT FAIL OPEN & IPv4-MAPPED IPv6
  // =========================================================================
  describe('3. P0 — Fail-Closed DNS Pre-Flight & IPv6 Classification', () => {
    it('DNS lookup rejected when hostname resolves to private IPv4 or forbidden IPv6', async () => {
      vi.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '192.168.10.25', family: 4 },
      ] as any);
      const resV4 = await validateBridgeUrlAsync('wss://bridge-private.example.com/ws');
      expect(resV4.valid).toBe(false);
      expect(resV4.error).toMatch(/forbidden IPv4/i);

      vi.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: 'fe80::1', family: 6 },
      ] as any);
      const resV6 = await validateBridgeUrlAsync('wss://bridge-ll.example.com/ws');
      expect(resV6.valid).toBe(false);
      expect(resV6.error).toMatch(/forbidden IPv6/i);
    });

    it('DNS lookup returns empty results -> fails closed (rejected)', async () => {
      vi.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([] as any);
      const result = await validateBridgeUrlAsync('wss://empty-dns.example.com/ws');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/no address records/i);
    });

    it('DNS lookup throws (ENOTFOUND / EAI_AGAIN) -> fails closed (rejected)', async () => {
      vi.spyOn(dns.promises, 'lookup').mockRejectedValueOnce(
        Object.assign(new Error('getaddrinfo ENOTFOUND dead-host.example.com'), {
          code: 'ENOTFOUND',
        })
      );
      const result = await validateBridgeUrlAsync('wss://dead-host.example.com/ws');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/DNS lookup failed/i);
    });

    it('DNS lookup timeout -> fails closed (rejected)', async () => {
      vi.spyOn(dns.promises, 'lookup').mockImplementationOnce(
        () => new Promise(() => {}) as any // Never resolves
      );
      const result = await validateBridgeUrlAsync('wss://slow-dns.example.com/ws', {
        dnsTimeoutMs: 60,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/timed out/i);
    });

    it('DNS mixed public/private answers -> rejected when ANY answer is forbidden', async () => {
      vi.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ] as any);
      const mixed1 = await validateBridgeUrlAsync('wss://mixed-v4.example.com/ws');
      expect(mixed1.valid).toBe(false);
      expect(mixed1.error).toMatch(/forbidden IPv4/i);

      vi.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '93.184.216.34', family: 4 },
        { address: '::ffff:169.254.169.254', family: 6 },
      ] as any);
      const mixed2 = await validateBridgeUrlAsync('wss://mixed-v6.example.com/ws');
      expect(mixed2.valid).toBe(false);
      expect(mixed2.error).toMatch(/forbidden IPv6/i);

      // Pure public address succeeds
      vi.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '93.184.216.34', family: 4 },
      ] as any);
      const purePublic = await validateBridgeUrlAsync('wss://public-ok.example.com/ws');
      expect(purePublic.valid).toBe(true);
    });

    it('IPv4-mapped IPv6, NAT64, 6to4, and IPv4-compatible bypass forms are all blocked', () => {
      const forbiddenUrls = [
        'ws://[::ffff:169.254.169.254]:80',
        'ws://[0:0:0:0:0:ffff:a9fe:a9fe]:80',
        'ws://[::ffff:127.0.0.1]:21213',
        'ws://[::ffff:10.0.0.1]:8080',
        'ws://[::ffff:192.168.1.1]:8080',
        'ws://[64:ff9b::169.254.169.254]:80',
        'ws://[64:ff9b:1::1]:8080',
        'ws://[2002:0a00:0001::1]:8080',
        'ws://[::127.0.0.1]:21213',
        'ws://[::169.254.169.254]:80',
        'ws://[fe80::1]:8080',
        'ws://[fec0::1]:8080',
        'ws://[fc00::1]:8080',
        'ws://[fd12:3456:789a::1]:8080',
        'ws://[ff02::1]:8080',
      ];
      for (const u of forbiddenUrls) {
        expect(validateBridgeUrl(u).valid, `Expected ${u} to be blocked`).toBe(false);
      }
    });
  });

  // =========================================================================
  // 4. P1 — WIRE BRIDGE HOST ALLOWLIST END-TO-END
  // =========================================================================
  describe('4. P1 — End-to-End Bridge Host Allowlist Enforcement', () => {
    it('Bridge host allowlist permits exact host, blocks unlisted host, and blocks IP literal bypass', async () => {
      const allowedOpts = { allowedHosts: ['trusted-bridge.example.com'] };

      // Exact host permitted
      expect(validateBridgeUrl('wss://trusted-bridge.example.com:8443/live', allowedOpts).valid).toBe(
        true
      );
      // Unlisted domain blocked
      expect(validateBridgeUrl('wss://untrusted.example.com:8443/live', allowedOpts).valid).toBe(
        false
      );
      // Public IPv4 literal MUST NOT bypass configured allowlist
      expect(validateBridgeUrl('wss://93.184.216.34:8443/live', allowedOpts).valid).toBe(false);
      // Public IPv6 literal MUST NOT bypass configured allowlist
      expect(
        validateBridgeUrl('wss://[2606:2800:220:1:248:1893:25c8:1946]:8443/live', allowedOpts).valid
      ).toBe(false);
      // Explicit IP literal in allowlist IS permitted
      expect(
        validateBridgeUrl('wss://93.184.216.34:8443/live', {
          allowedHosts: ['93.184.216.34'],
        }).valid
      ).toBe(true);
      // Local loopback bridge remains permitted under default local policy
      expect(validateBridgeUrl(`ws://127.0.0.1:${bridgePort}`, allowedOpts).valid).toBe(true);
    });

    it('GameServer wires allowedBridgeHosts end-to-end through TikTokLiveAdapter to transport', async () => {
      const server = new GameServer({
        port: 0,
        host: '127.0.0.1',
        persistence: new LocalStoragePersistence('allowlist_srv_test_'),
        operatorToken: 'allowlist_op_token',
        allowedBridgeHosts: ['trusted-bridge.example.com'],
      });
      const serverPort = await server.startStandalone();

      // 1. Unlisted remote domain rejected via /api/live/connect
      const resDomain = await fetch(`http://127.0.0.1:${serverPort}/api/live/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': 'allowlist_op_token',
        },
        body: JSON.stringify({
          platform: 'tiktok_experimental',
          channelId: '@streamer',
          bridgeUrl: 'wss://evil-remote.example.com:8443/live',
        }),
      });
      const dataDomain = (await resDomain.json()) as { ok: boolean; error?: string };
      expect(dataDomain.ok).toBe(false);
      expect(dataDomain.error).toMatch(/not in allowed bridge hosts/i);

      // 2. Public IP literal bypass attempt rejected via /api/live/connect
      const resIp = await fetch(`http://127.0.0.1:${serverPort}/api/live/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': 'allowlist_op_token',
        },
        body: JSON.stringify({
          platform: 'tiktok_experimental',
          channelId: '@streamer',
          bridgeUrl: 'wss://93.184.216.34:8443/live',
        }),
      });
      const dataIp = (await resIp.json()) as { ok: boolean; error?: string };
      expect(dataIp.ok).toBe(false);
      expect(dataIp.error).toMatch(/not in allowed bridge hosts/i);

      // 3. Local loopback bridge still connects cleanly under default loopback policy
      const resLocal = await fetch(`http://127.0.0.1:${serverPort}/api/live/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': 'allowlist_op_token',
        },
        body: JSON.stringify({
          platform: 'tiktok_experimental',
          channelId: '@streamer',
          bridgeUrl: `ws://127.0.0.1:${bridgePort}`,
          requireAck: true,
        }),
      });
      const dataLocal = (await resLocal.json()) as { ok: boolean; liveConnection: any };
      expect(dataLocal.ok).toBe(true);
      expect(dataLocal.liveConnection.subscriptionVerified).toBe(true);

      await server.shutdown();
    });

    it('LIVE_CITY_ALLOWED_BRIDGE_HOSTS environment variable is honored by GameServer', async () => {
      const prevEnv = process.env.LIVE_CITY_ALLOWED_BRIDGE_HOSTS;
      process.env.LIVE_CITY_ALLOWED_BRIDGE_HOSTS = 'env-bridge.example.com, 93.184.216.34';
      try {
        const server = new GameServer({
          port: 0,
          host: '127.0.0.1',
          persistence: new LocalStoragePersistence('env_allowlist_test_'),
          operatorToken: 'env_op_token',
        });
        expect(server.getAllowedBridgeHosts()).toEqual(['env-bridge.example.com', '93.184.216.34']);

        await expect(
          server.tiktokAdapter.connect({
            channelId: '@streamer',
            bridgeUrl: 'wss://other-host.example.com/live',
          })
        ).rejects.toThrow(/not in allowed bridge hosts/i);

        await server.shutdown();
      } finally {
        if (prevEnv === undefined) {
          delete process.env.LIVE_CITY_ALLOWED_BRIDGE_HOSTS;
        } else {
          process.env.LIVE_CITY_ALLOWED_BRIDGE_HOSTS = prevEnv;
        }
      }
    });
  });

  // =========================================================================
  // 5. P1 — ORIGINLESS REQUEST & HOST HEADER VALIDATION POLICY
  // =========================================================================
  describe('5. P1 — Consistent Host & Origin Policy on Originless Requests', () => {
    it('isAllowedOrigin returns false for undefined, empty string, and null', async () => {
      const server = new GameServer({
        port: 0,
        host: '127.0.0.1',
        persistence: new LocalStoragePersistence('origin_policy_test_'),
        operatorToken: 'op_tok',
      });
      expect(server.isAllowedOrigin(undefined)).toBe(false);
      expect(server.isAllowedOrigin('')).toBe(false);
      expect(server.isAllowedOrigin('null')).toBe(false);
      expect(server.isAllowedOrigin('NULL')).toBe(false);
      expect(server.isAllowedOrigin('http://localhost:5173')).toBe(true);
      await server.shutdown();
    });

    it('Host header validation enforces exact server loopback port on originless requests', async () => {
      const server = new GameServer({
        port: 0,
        host: '127.0.0.1',
        persistence: new LocalStoragePersistence('host_policy_test_'),
        operatorToken: 'host_secret_token_777',
      });
      const port = await server.startStandalone();

      // Valid originless Node.js client with matching Host succeeds
      const okStatus = await rawHttpGet(port, '/api/status', { Host: `127.0.0.1:${port}` });
      expect(okStatus.statusCode).toBe(200);
      expect(okStatus.headers['access-control-allow-origin']).toBeUndefined();

      const okSession = await rawHttpGet(port, '/api/auth/session', { Host: `localhost:${port}` });
      expect(okSession.statusCode).toBe(200);
      expect(JSON.parse(okSession.body).operatorToken).toBe('host_secret_token_777');

      // Untrusted Host headers MUST be rejected on BOTH /api/status and /api/auth/session
      const badHosts = [
        `evil-rebind.com:${port}`,
        'localhost:9999',
        'localhost:evil.com',
        '127.0.0.1:8888',
      ];
      for (const badHost of badHosts) {
        const resStatus = await rawHttpGet(port, '/api/status', { Host: badHost });
        expect(resStatus.statusCode, `Expected /api/status Host:${badHost} -> 403`).toBe(403);

        const resSession = await rawHttpGet(port, '/api/auth/session', { Host: badHost });
        expect(resSession.statusCode, `Expected /api/auth/session Host:${badHost} -> 403`).toBe(403);
        expect(resSession.body).not.toContain('host_secret_token_777');
      }

      // Originless with Sec-Fetch-Site: cross-site rejected
      const crossSiteRes = await rawHttpGet(port, '/api/auth/session', {
        Host: `127.0.0.1:${port}`,
        'Sec-Fetch-Site': 'cross-site',
      });
      expect(crossSiteRes.statusCode).toBe(403);
      expect(crossSiteRes.body).not.toContain('host_secret_token_777');

      // Empty Origin header rejected
      const emptyOriginRes = await rawHttpGet(port, '/api/auth/session', {
        Host: `127.0.0.1:${port}`,
        Origin: '',
      });
      expect(emptyOriginRes.statusCode).toBe(403);

      await server.shutdown();
    });
  });

  // =========================================================================
  // 6. P1 — ACTUAL WEBSOCKET /ws SNAPSHOT, STATE_SYNC & OBS STAGE-ONLY REGRESSION
  // =========================================================================
  describe('6. P1 — Actual WebSocket /ws Handshake, State Sync & Stage-Only Read-Only Regression', () => {
    it('Actual WebSocket /ws accepts allowed Origin, sends snapshot + state_sync, and rejects untrusted Origin/Host', async () => {
      const server = new GameServer({
        port: 0,
        host: '127.0.0.1',
        persistence: new LocalStoragePersistence('ws_real_test_'),
        operatorToken: 'ws_op_token',
      });
      const port = await server.startStandalone();

      // 1. Unauthorized Origin rejected with 403
      const badOriginWs = await openRawWsClient(port, {
        Host: `127.0.0.1:${port}`,
        Origin: 'http://localhost:8888',
      });
      expect(badOriginWs.statusCode).toBe(403);
      badOriginWs.close();

      // 2. Origin: null rejected with 403
      const nullOriginWs = await openRawWsClient(port, {
        Host: `127.0.0.1:${port}`,
        Origin: 'null',
      });
      expect(nullOriginWs.statusCode).toBe(403);
      nullOriginWs.close();

      // 3. Untrusted Host rejected with 403
      const badHostWs = await openRawWsClient(port, {
        Host: `evil-rebind.com:${port}`,
      });
      expect(badHostWs.statusCode).toBe(403);
      badHostWs.close();

      // 4. Allowed Origin accepted (101) -> receives initial snapshot -> receives state_sync on mutation
      const goodWs = await openRawWsClient(port, {
        Host: `127.0.0.1:${port}`,
        Origin: 'http://localhost:5173',
      });
      expect(goodWs.statusCode).toBe(101);

      const snapshotMsg = await goodWs.waitForMessage((m) => m.type === 'snapshot');
      expect(snapshotMsg.payload).toBeDefined();
      expect(snapshotMsg.payload.citizens.length).toBe(0);

      // Mutate authoritative server via authenticated operator command
      const cmdRes = await fetch(`http://127.0.0.1:${port}/api/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': 'ws_op_token',
        },
        body: JSON.stringify({
          type: 'comment',
          userName: 'WsObserverCheck',
          comment: 'VÀO',
        }),
      });
      expect(cmdRes.status).toBe(200);

      const syncMsg = await goodWs.waitForMessage(
        (m) =>
          m.type === 'state_sync' &&
          Array.isArray(m.payload?.citizens) &&
          m.payload.citizens.length === 1
      );
      expect(syncMsg.payload.citizens[0].userName).toBe('WsObserverCheck');

      goodWs.close();
      await server.shutdown();
    });

    it('Stage-only mode observes without token, stays strictly read-only, and never spawns fallback engine on disconnect', async () => {
      const server = new GameServer({
        port: 0,
        host: '127.0.0.1',
        persistence: new LocalStoragePersistence('stage_readonly_test_'),
        operatorToken: 'stage_secret_token',
      });
      const port = await server.startStandalone();

      const stageClient = new GameRuntimeClient(port);
      // Even if allowOfflineFallback=true is passed, isStageOnly=true MUST forbid fallback engine!
      await stageClient.init(true, true);
      expect(stageClient.isReadOnlyStage()).toBe(true);

      await new Promise((r) => setTimeout(r, 150));
      expect(stageClient.getClientState().syncStatus).toBe('connected');
      expect(stageClient.hasFallbackEngine()).toBe(false);

      // Stage-only client MUST remain read-only: calling sendComment / resetWorld must NOT mutate server
      await stageClient.sendComment('VÀO', 'UnauthorizedStageUser');
      await stageClient.resetWorld();
      await new Promise((r) => setTimeout(r, 80));
      expect(server.engine.worldState.citizens.size).toBe(0);

      // Operator mutates state -> Stage observes via WebSocket state_sync without needing operator token
      await fetch(`http://127.0.0.1:${port}/api/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': 'stage_secret_token',
        },
        body: JSON.stringify({
          type: 'comment',
          userName: 'RealViewer',
          comment: 'VÀO',
        }),
      });
      await new Promise((r) => setTimeout(r, 150));
      expect(stageClient.worldState.citizens.size).toBe(1);
      expect(stageClient.worldState.getCitizenByUserId('user_realviewer')?.userName).toBe(
        'RealViewer'
      );

      // Shut down authoritative server -> Stage MUST transition to reconnecting and NEVER spawn fallback engine
      await server.shutdown();
      await new Promise((r) => setTimeout(r, 200));
      expect(stageClient.getClientState().syncStatus).toBe('reconnecting');
      expect(stageClient.hasFallbackEngine()).toBe(false);

      stageClient.destroy();
    });
  });
});
