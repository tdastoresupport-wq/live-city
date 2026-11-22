import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import { WebSocketBridgeTransport } from '../core/adapters/WebSocketBridgeTransport';
import { TikTokLiveAdapter } from '../core/adapters/TikTokLiveAdapter';
import { RateLimiter } from '../core/commands/RateLimiter';
import { upgradeToWebSocket, WsClient } from '../server/wsProtocol';
import type { RawLiveComment, RawLiveGift, RawLiveLike } from '../core/types';

class ProtocolFixtureBridge {
  private server: http.Server | null = null;
  public clients: Set<WsClient> = new Set();
  public port = 0;
  public receivedFrames: any[] = [];
  public handler: (client: WsClient, frame: any) => void = (client, frame) => {
    if (frame?.action === 'subscribe') {
      client.send({
        action: 'ack',
        status: 'subscribed',
        channelId: frame.channelId,
      });
    }
  };

  public async start(): Promise<number> {
    this.server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });

    this.server.on('upgrade', (req, socket) => {
      const client = upgradeToWebSocket(
        req,
        socket,
        (c, text) => {
          try {
            const parsed = JSON.parse(text);
            this.receivedFrames.push(parsed);
            this.handler(c, parsed);
          } catch {
            // ignore non-json
          }
        },
        (c) => {
          this.clients.delete(c);
        }
      );
      if (client) {
        this.clients.add(client);
      }
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address() as { port: number };
        this.port = addr.port;
        resolve();
      });
    });
    return this.port;
  }

  public broadcast(payload: unknown): void {
    for (const c of this.clients) {
      c.send(payload);
    }
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
      const s = this.server;
      this.server = null;
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
  }
}

describe('Bridge Protocol Conformance & Rate-Limit Security Hardening', () => {
  const bridges: ProtocolFixtureBridge[] = [];
  const adapters: TikTokLiveAdapter[] = [];

  afterEach(async () => {
    for (const a of adapters) {
      await a.disconnect().catch(() => {});
    }
    adapters.length = 0;

    for (const b of bridges) {
      await b.stop();
    }
    bridges.length = 0;
  });

  it('completes subscribe + strict ACK and normalizes redacted Convention A & B wire fixtures', async () => {
    const bridge = new ProtocolFixtureBridge();
    bridges.push(bridge);
    const port = await bridge.start();

    const transport = new WebSocketBridgeTransport();
    const adapter = new TikTokLiveAdapter({
      bridgeUrl: `ws://127.0.0.1:${port}`,
      requireAck: true,
      transport,
      maxReplayAgeMs: 120_000,
    });
    adapters.push(adapter);

    const comments: RawLiveComment[] = [];
    const gifts: RawLiveGift[] = [];
    const likes: RawLiveLike[] = [];
    adapter.onComment((c) => comments.push(c));
    adapter.onGift((g) => gifts.push(g));
    adapter.onLike((l) => likes.push(l));

    await adapter.connect({ channelId: '@RedactedCreator' });
    expect(adapter.getConnectionState().status).toBe('connected');
    expect(adapter.getConnectionState().subscriptionVerified).toBe(true);
    expect(bridge.receivedFrames[0]).toEqual({
      action: 'subscribe',
      platform: 'tiktok',
      channelId: '@RedactedCreator',
    });

    const nowSec = Math.floor(Date.now() / 1000);
    const nowMs = Date.now();

    // Redacted Convention A: comment (seconds timestamp), gift, like
    bridge.broadcast({
      type: 'comment',
      eventId: 'msg_redacted_001',
      userId: 'usr_redacted_101',
      uniqueId: 'viewer_alpha',
      nickname: 'Viewer Alpha',
      comment: 'xay',
      timestamp: nowSec,
    });
    bridge.broadcast({
      type: 'gift',
      eventId: 'gift_redacted_002',
      userId: 'usr_redacted_102',
      uniqueId: 'donor_beta',
      nickname: 'Donor Beta',
      giftName: 'Rose',
      repeatCount: 3,
      diamondCount: 3,
      timestamp: nowMs,
    });
    bridge.broadcast({
      type: 'like',
      eventId: 'like_redacted_003',
      userId: 'usr_redacted_103',
      uniqueId: 'fan_gamma',
      nickname: 'Fan Gamma',
      likeCount: 15,
      totalLikeCount: 1250,
      timestamp: nowMs,
    });

    // Redacted Convention B: event wrapper with nested data (chat, gift fallback diamonds, like)
    bridge.broadcast({
      event: 'chat',
      data: {
        msgId: 'msg_redacted_004',
        secUid: 'sec_redacted_201',
        uniqueId: 'viewer_delta',
        nickname: 'Viewer Delta',
        comment: '!go',
        createTime: nowSec,
      },
    });
    bridge.broadcast({
      event: 'gift',
      data: {
        id: 'gift_redacted_005',
        userId: 'usr_redacted_202',
        nickname: 'Donor Epsilon',
        giftName: 'TikTok Universe',
        count: 2,
        createTime: nowMs,
      },
    });

    await new Promise((r) => setTimeout(r, 80));

    expect(comments).toHaveLength(2);
    expect(comments[0].comment).toBe('xay');
    expect(comments[0].userName).toBe('Viewer Alpha');
    expect(comments[1].comment).toBe('!go');
    expect(comments[1].userId).toBe('sec_redacted_201');

    expect(gifts).toHaveLength(2);
    expect(gifts[0].giftName).toBe('Rose');
    expect(gifts[0].giftCount).toBe(3);
    expect(gifts[1].diamondValue).toBe(20); // Convention B fallback: 2 * 10

    expect(likes).toHaveLength(1);
    expect(likes[0].likeCount).toBe(15);
    expect(likes[0].totalLikes).toBe(1250);
  });

  it('stamps authoritative server clock timestamp and keeps RateLimiter monotonic against near-future payload timestamps', () => {
    const adapter = new TikTokLiveAdapter({ maxReplayAgeMs: 120_000 });
    adapters.push(adapter);
    const rateLimiter = new RateLimiter(3000, 30);

    const delivered: RawLiveComment[] = [];
    adapter.onComment((c) => delivered.push(c));

    // Malicious/skewed future timestamp inside replay tolerance (+100s)
    const before = Date.now();
    const accepted = adapter.handleIncomingPayload({
      type: 'comment',
      eventId: 'future_skew_01',
      userId: 'usr_skew',
      nickname: 'SkewUser',
      comment: 'go',
      timestamp: before + 100_000,
    });
    const after = Date.now();

    expect(accepted).toBe(true);
    expect(delivered).toHaveLength(1);
    // Must use local server clock, NOT the +100s untrusted timestamp
    expect(delivered[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(delivered[0].timestamp).toBeLessThanOrEqual(after + 50);

    // Passing normalized server timestamp into RateLimiter must not lock user for 103 seconds
    const firstCheck = rateLimiter.checkAndRecord(delivered[0].userId, delivered[0].timestamp);
    expect(firstCheck.allowed).toBe(true);

    // 3.5 seconds later, user MUST be allowed again
    const laterCheck = rateLimiter.checkAndRecord(delivered[0].userId, after + 3500);
    expect(laterCheck.allowed).toBe(true);

    // Out-of-order stale timestamp must not corrupt or regress cooldown
    const staleAttempt = rateLimiter.checkAndRecord('usr_skew', after + 1000);
    expect(staleAttempt.allowed).toBe(false);
    expect(staleAttempt.reason).toBe('user_cooldown');

    // Out-of-window stale replay (> maxReplayAgeMs) must be rejected by adapter
    const expiredAccepted = adapter.handleIncomingPayload({
      type: 'comment',
      eventId: 'expired_replay_01',
      userId: 'usr_skew',
      nickname: 'SkewUser',
      comment: 'da',
      timestamp: Date.now() - 300_000,
    });
    expect(expiredAccepted).toBe(false);
  });

  it('rejects error frames, wrong-channel ACK, and recovers subscriptionVerified cleanly across reconnects', async () => {
    const bridge = new ProtocolFixtureBridge();
    bridges.push(bridge);
    const port = await bridge.start();

    let attempt = 0;
    bridge.handler = (client, frame) => {
      if (frame?.action === 'subscribe') {
        attempt++;
        if (attempt === 1) {
          // Wrong channel ACK must be rejected
          client.send({
            action: 'ack',
            status: 'subscribed',
            channelId: 'someone_else',
          });
        } else {
          client.send({
            type: 'subscribed',
            channel: frame.channelId,
          });
        }
      }
    };

    const transport = new WebSocketBridgeTransport();
    const adapter = new TikTokLiveAdapter({
      bridgeUrl: `ws://127.0.0.1:${port}`,
      requireAck: true,
      maxReconnectAttempts: 0,
      transport,
    });
    adapters.push(adapter);

    await expect(adapter.connect({ channelId: 'TargetCreator' })).rejects.toThrow(/mismatch|error|failed|unverified/i);
    expect(adapter.getConnectionState().status).toBe('error');
    expect(adapter.getConnectionState().subscriptionVerified).toBe(false);

    // Second attempt receives matching strict ACK -> connects and verifies
    await adapter.connect({ channelId: '@TargetCreator' });
    expect(adapter.getConnectionState().status).toBe('connected');
    expect(adapter.getConnectionState().subscriptionVerified).toBe(true);
  });
});
