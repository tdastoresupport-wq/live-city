import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import {
  WebSocketBridgeTransport,
  validateBridgeUrl,
} from '../core/adapters/WebSocketBridgeTransport';
import {
  TikTokLiveAdapter,
  ILiveBridgeTransport,
  ExternalStreamPayload,
} from '../core/adapters/TikTokLiveAdapter';
import { GameServer } from '../server/GameServer';
import { LocalStoragePersistence } from '../core/adapters/LocalStoragePersistence';
import { upgradeToWebSocket, WsClient } from '../server/wsProtocol';

class MockBridgeServer {
  public server: http.Server | null = null;
  public clients: Set<WsClient> = new Set();
  public port = 0;
  public lastSubscribeMessage: any = null;
  public shouldSendAck = true;
  public shouldSendError = false;

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
            if (this.shouldSendError) {
              c.send({ status: 'error', message: 'Channel is offline' });
            } else if (this.shouldSendAck) {
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

  public dropAll(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }

  public async stop(): Promise<void> {
    this.dropAll();
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }
}

class FakeBridgeTransport implements ILiveBridgeTransport {
  public messageCallbacks: Set<(payload: ExternalStreamPayload) => void> = new Set();
  public closeCallbacks: Set<(reason?: string) => void> = new Set();
  public isConnected = false;
  public verified = false;

  public async connect(_channelId: string, _bridgeUrl: string): Promise<void> {
    this.isConnected = true;
    this.verified = true;
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
    this.verified = false;
  }

  public onMessage(cb: (payload: ExternalStreamPayload) => void): () => void {
    this.messageCallbacks.add(cb);
    return () => this.messageCallbacks.delete(cb);
  }

  public onClose(cb: (reason?: string) => void): () => void {
    this.closeCallbacks.add(cb);
    return () => this.closeCallbacks.delete(cb);
  }

  public isSubscriptionVerified(): boolean {
    return this.verified;
  }

  public emitPayload(payload: ExternalStreamPayload): void {
    for (const cb of this.messageCallbacks) {
      cb(payload);
    }
  }

  public simulateDrop(reason = 'Socket dropped'): void {
    this.isConnected = false;
    for (const cb of this.closeCallbacks) {
      cb(reason);
    }
  }
}

describe('Bridge Reliability & WebSocket Lifecycle Hardening', () => {
  let bridgeServer: MockBridgeServer;
  let bridgePort: number;

  beforeEach(async () => {
    bridgeServer = new MockBridgeServer();
    bridgePort = await bridgeServer.start();
  });

  afterEach(async () => {
    if (bridgeServer) {
      await bridgeServer.stop();
    }
  });

  describe('1. URL Validation & Safety', () => {
    it('should validate URLs and disallow invalid schemes and SSRF addresses', () => {
      expect(validateBridgeUrl('ws://127.0.0.1:21213').valid).toBe(true);
      expect(validateBridgeUrl('wss://localhost:8443').valid).toBe(true);

      expect(validateBridgeUrl('http://127.0.0.1:21213').valid).toBe(false);
      expect(validateBridgeUrl('ftp://127.0.0.1:21213').valid).toBe(false);
      expect(validateBridgeUrl('javascript:alert(1)').valid).toBe(false);
      expect(validateBridgeUrl('ws://169.254.169.254/secret').valid).toBe(false);
      expect(validateBridgeUrl('ws://metadata.google.internal/computeMetadata').valid).toBe(false);
      expect(validateBridgeUrl('').valid).toBe(false);
    });
  });

  describe('2. Connection Lifecycle & Reconnection Order', () => {
    it('should connect successfully and send subscribe handshake', async () => {
      const transport = new WebSocketBridgeTransport();
      await transport.connect('@livecity', `ws://127.0.0.1:${bridgePort}`, {
        requireAck: true,
      });

      expect(transport.isSocketConnected()).toBe(true);
      expect(transport.isSubscriptionVerified()).toBe(true);
      expect(bridgeServer.lastSubscribeMessage).toEqual({
        action: 'subscribe',
        platform: 'tiktok',
        channelId: '@livecity',
      });

      await transport.disconnect();
    });

    it('should not reconnect after a manual disconnect', async () => {
      const transport = new FakeBridgeTransport();
      const adapter = new TikTokLiveAdapter({
        channelId: '@test_streamer',
        transport,
        baseBackoffMs: 20,
      });

      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);

      // Explicit manual disconnect
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
      expect(adapter.getConnectionState().status).toBe('disconnected');

      // Wait longer than backoff
      await new Promise((r) => setTimeout(r, 60));

      // Should still remain disconnected
      expect(adapter.isConnected()).toBe(false);
      expect(adapter.getConnectionState().status).toBe('disconnected');
      expect(adapter.getConnectionState().reconnectAttempts).toBe(0);
    });

    it('should trigger reconnect on unexpected socket close and use exponential backoff', async () => {
      const transport = new FakeBridgeTransport();
      const adapter = new TikTokLiveAdapter({
        channelId: '@test_streamer',
        transport,
        baseBackoffMs: 20,
        maxReconnectAttempts: 3,
      });

      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);

      // Simulate unexpected network drop
      transport.simulateDrop('Connection reset by peer');

      // Adapter must immediately transition to reconnecting
      const state1 = adapter.getConnectionState();
      expect(state1.status === 'reconnecting' || state1.status === 'error').toBe(true);
      expect(state1.reconnectAttempts).toBe(1);

      // Wait for first backoff (20ms * 2^0 = 20ms)
      await new Promise((r) => setTimeout(r, 35));

      // Reconnect succeeds because transport is ready
      expect(adapter.isConnected()).toBe(true);
      expect(adapter.getConnectionState().status).toBe('connected');
      expect(adapter.getConnectionState().reconnectAttempts).toBe(0);

      await adapter.disconnect();
    });

    it('should reconnect successfully over real WebSocket after bridge restart', async () => {
      const transport = new WebSocketBridgeTransport();
      const adapter = new TikTokLiveAdapter({
        channelId: '@restart_test',
        transport,
        bridgeUrl: `ws://127.0.0.1:${bridgePort}`,
        baseBackoffMs: 30,
        maxReconnectAttempts: 4,
      });

      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);

      // Stop bridge server completely
      await bridgeServer.stop();

      // Wait for adapter to detect drop and enter reconnecting
      await new Promise((r) => setTimeout(r, 60));
      expect(adapter.getConnectionState().status).toBe('reconnecting');

      // Restart bridge server on the exact same port
      bridgeServer = new MockBridgeServer();
      await bridgeServer.start(bridgePort);

      // Wait for backoff retry to succeed
      await new Promise((r) => setTimeout(r, 150));
      expect(adapter.isConnected()).toBe(true);
      expect(adapter.getConnectionState().status).toBe('connected');

      await adapter.disconnect();
    });
  });

  describe('3. Dynamic Bridge URL via API & No Leaks', () => {
    it('should allow dashboard to connect with custom bridgeUrl without server restart', async () => {
      const server = new GameServer({
        port: 0,
        host: '127.0.0.1',
        persistence: new LocalStoragePersistence('dynamic_test_'),
        operatorToken: 'dynamic_test_token',
      });
      const serverPort = await server.startStandalone();

      // Initially no bridge URL configured
      expect(server.tiktokAdapter.getConnectionState().status).toBe('disconnected');

      // Send connect with dynamic bridgeUrl
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/live/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': 'dynamic_test_token',
        },
        body: JSON.stringify({
          platform: 'tiktok_experimental',
          channelId: '@dynamic_streamer',
          bridgeUrl: `ws://127.0.0.1:${bridgePort}`,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { ok: boolean; liveConnection: { status: string } };
      expect(data.ok).toBe(true);
      expect(data.liveConnection.status).toBe('connected');

      // Verify bridge received the connection
      expect(bridgeServer.clients.size).toBe(1);

      await server.shutdown();
    });

    it('should not leak old sockets when changing bridge endpoints', async () => {
      const bridge2 = new MockBridgeServer();
      const port2 = await bridge2.start();

      const transport = new WebSocketBridgeTransport();
      await transport.connect('@streamer', `ws://127.0.0.1:${bridgePort}`);
      expect(bridgeServer.clients.size).toBe(1);

      // Switch to bridge 2
      await transport.connect('@streamer', `ws://127.0.0.1:${port2}`);
      expect(bridge2.clients.size).toBe(1);

      // Old bridge must have 0 clients
      await new Promise((r) => setTimeout(r, 50));
      expect(bridgeServer.clients.size).toBe(0);

      await transport.disconnect();
      await bridge2.stop();
    });
  });

  describe('4. Handshake Acknowledgement & Verification', () => {
    it('should fail connect when requireAck is true and bridge sends an error', async () => {
      bridgeServer.shouldSendError = true;
      const transport = new WebSocketBridgeTransport();

      await expect(
        transport.connect('@offline_channel', `ws://127.0.0.1:${bridgePort}`, {
          requireAck: true,
          ackTimeoutMs: 500,
        })
      ).rejects.toThrow(/Channel is offline/);

      expect(transport.isSubscriptionVerified()).toBe(false);
      await transport.disconnect();
    });
  });

  describe('5. Robust Payload Normalization', () => {
    const transport = new WebSocketBridgeTransport();

    it('should normalize numeric eventId and seconds timestamp properly', () => {
      const raw = {
        type: 'comment',
        eventId: 123456789, // numeric ID
        userId: 98765,      // numeric userId
        userName: 1001,     // numeric username
        comment: 'GỖ',
        timestamp: 1716383000, // seconds
      };

      const normalized = transport.normalizePayload(raw);
      expect(normalized).not.toBeNull();
      expect(normalized?.eventId).toBe('123456789');
      expect(normalized?.userId).toBe('98765');
      expect(normalized?.comment).toBe('GỖ');
      expect(normalized?.timestamp).toBe(1716383000000);
    });

    it('should reject invalid and empty payloads safely without crashing', () => {
      expect(transport.normalizePayload(null)).toBeNull();
      expect(transport.normalizePayload(undefined)).toBeNull();
      expect(transport.normalizePayload('invalid string')).toBeNull();
      expect(transport.normalizePayload({ type: 'comment', comment: '   ' })).toBeNull(); // empty comment
      expect(transport.normalizePayload({ type: 'comment', comment: '' })).toBeNull();
      expect(transport.normalizePayload({ type: 'gift', repeatCount: -5 })).toBeNull(); // missing userId
    });

    it('should normalize Convention B webcast bridge format', () => {
      const rawB = {
        event: 'chat',
        data: {
          msgId: 555666,
          userId: 777888,
          nickname: 'TikTokFan',
          comment: 'ĐÁ',
          createTime: 1716384000,
        },
      };

      const normalized = transport.normalizePayload(rawB);
      expect(normalized?.type).toBe('comment');
      expect(normalized?.eventId).toBe('555666');
      expect(normalized?.userId).toBe('777888');
      expect(normalized?.nickname).toBe('TikTokFan');
      expect(normalized?.comment).toBe('ĐÁ');
      expect(normalized?.timestamp).toBe(1716384000000);
    });
  });

  describe('6. Duplicate Subscriptions & Event Idempotency', () => {
    it('should have only one subscriber in adapter so events are processed once', async () => {
      const server = new GameServer({
        port: 0,
        host: '127.0.0.1',
        persistence: new LocalStoragePersistence('sub_test_'),
        operatorToken: 'sub_test_token',
      });
      await server.startStandalone();

      // Check adapter listeners count directly: must be exactly 1
      expect((server.tiktokAdapter as any).commentCallbacks.size).toBe(1);
      expect((server.tiktokAdapter as any).giftCallbacks.size).toBe(1);
      expect((server.tiktokAdapter as any).likeCallbacks.size).toBe(1);

      const now = Date.now();
      // Send comment
      server.tiktokAdapter.handleIncomingPayload({
        type: 'comment',
        eventId: 'single_test_1',
        userId: 'unique_user_99',
        nickname: 'SoloUser',
        comment: 'VÀO',
        timestamp: now,
      });

      // Exactly 1 citizen created
      expect(server.engine.worldState.citizens.size).toBe(1);
      const citizen = server.engine.worldState.getCitizenByUserId('unique_user_99');
      expect(citizen?.userName).toBe('SoloUser');

      // Duplicate submission rejected by Deduplicator
      const acceptedDup = server.tiktokAdapter.handleIncomingPayload({
        type: 'comment',
        eventId: 'single_test_1',
        userId: 'unique_user_99',
        nickname: 'SoloUser',
        comment: 'VÀO',
        timestamp: now,
      });
      expect(acceptedDup).toBe(false);

      await server.shutdown();
    });
  });
});
