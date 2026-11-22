import { describe, it, expect } from 'vitest';
import {
  TikTokLiveAdapter,
  ILiveBridgeTransport,
  ExternalStreamPayload,
} from '../core/adapters/TikTokLiveAdapter';
import { GameEngine } from '../core/engine/GameEngine';

class FakeBridgeTransport implements ILiveBridgeTransport {
  public messageCallbacks: Set<(payload: ExternalStreamPayload) => void> = new Set();
  public closeCallbacks: Set<(reason?: string) => void> = new Set();
  public shouldFailConnect = false;
  public connectCalls = 0;

  public async connect(_channelId: string, _bridgeUrl: string): Promise<void> {
    this.connectCalls++;
    if (this.shouldFailConnect) {
      throw new Error('Bridge connection refused');
    }
  }

  public async disconnect(): Promise<void> {}

  public onMessage(cb: (payload: ExternalStreamPayload) => void): () => void {
    this.messageCallbacks.add(cb);
    return () => this.messageCallbacks.delete(cb);
  }

  public onClose(cb: (reason?: string) => void): () => void {
    this.closeCallbacks.add(cb);
    return () => this.closeCallbacks.delete(cb);
  }

  public emitPayload(payload: ExternalStreamPayload): void {
    for (const cb of this.messageCallbacks) {
      cb(payload);
    }
  }

  public simulateDrop(reason = 'Socket dropped'): void {
    for (const cb of this.closeCallbacks) {
      cb(reason);
    }
  }
}

describe('P3 Live Event Adapter Architecture & Resilience', () => {
  it('should never fake connected status when TikTok bridge is not configured', async () => {
    const adapter = new TikTokLiveAdapter({ channelId: '@livecity_streamer' });
    await expect(adapter.connect()).rejects.toThrow();

    const state = adapter.getConnectionState();
    expect(state.status).toBe('error');
    expect(adapter.isConnected()).toBe(false);
    expect(state.errorMessage).toBeDefined();
  });

  it('should normalize comments, gifts, and likes through DI into GameEngine and reject replays/duplicates', async () => {
    const transport = new FakeBridgeTransport();
    const adapter = new TikTokLiveAdapter({
      channelId: '@livecity_streamer',
      bridgeUrl: 'ws://127.0.0.1:21213',
      transport,
      maxReplayAgeMs: 60_000,
    });

    const engine = new GameEngine({
      liveAdapter: adapter,
      headless: true,
    });

    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getConnectionState().status).toBe('connected');

    const now = Date.now();

    // 1. Valid comment event -> spawns citizen and starts wood harvest
    transport.emitPayload({
      type: 'comment',
      eventId: 'tt_evt_1',
      uniqueId: 'tiktok_user_1',
      nickname: 'TikTokLumberjack',
      comment: 'GỖ',
      timestamp: now,
    });

    const citizen = engine.worldState.getCitizenByUserId('tiktok_user_1');
    expect(citizen).toBeDefined();
    expect(citizen?.userName).toBe('TikTokLumberjack');
    expect(citizen?.state).toBe('moving_to_harvest');

    // 2. Duplicate event ID -> rejected
    const dupAccepted = adapter.handleIncomingPayload({
      type: 'comment',
      eventId: 'tt_evt_1',
      uniqueId: 'tiktok_user_1',
      nickname: 'TikTokLumberjack',
      comment: 'ĐÁ',
      timestamp: now,
    });
    expect(dupAccepted).toBe(false);

    // 3. Stale replay event (10 minutes old) -> rejected
    const replayAccepted = adapter.handleIncomingPayload({
      type: 'comment',
      eventId: 'tt_evt_old',
      uniqueId: 'tiktok_user_2',
      nickname: 'OldReplay',
      comment: 'VÀO',
      timestamp: now - 600_000,
    });
    expect(replayAccepted).toBe(false);
    expect(engine.worldState.getCitizenByUserId('tiktok_user_2')).toBeUndefined();

    // 4. Gift & Like normalization (community cheer without breaking gameplay balance)
    const giftAccepted = adapter.handleIncomingPayload({
      type: 'gift',
      eventId: 'tt_gift_1',
      uniqueId: 'tiktok_user_1',
      nickname: 'TikTokLumberjack',
      giftName: 'Rose',
      repeatCount: 3,
      diamondCount: 3,
      timestamp: now,
    });
    expect(giftAccepted).toBe(true);

    const likeAccepted = adapter.handleIncomingPayload({
      type: 'like',
      eventId: 'tt_like_1',
      uniqueId: 'tiktok_user_1',
      nickname: 'TikTokLumberjack',
      likeCount: 15,
      totalLikeCount: 100,
      timestamp: now,
    });
    expect(likeAccepted).toBe(true);

    engine.destroy();
  });

  it('should transition to reconnecting with backoff when transport drops unexpectedly', async () => {
    const transport = new FakeBridgeTransport();
    const adapter = new TikTokLiveAdapter({
      channelId: '@livecity_streamer',
      bridgeUrl: 'ws://127.0.0.1:21213',
      transport,
      baseBackoffMs: 30,
      maxReconnectAttempts: 2,
    });

    await adapter.connect();
    expect(adapter.getConnectionState().status).toBe('connected');

    // Simulate drop
    transport.simulateDrop('Network interruption');
    expect(adapter.getConnectionState().status).toBe('reconnecting');
    expect(adapter.getConnectionState().reconnectAttempts).toBe(1);

    // Wait for 50ms backoff reconnect to complete
    await new Promise((r) => setTimeout(r, 60));
    expect(adapter.getConnectionState().status).toBe('connected');
    expect(transport.connectCalls).toBe(2);

    await adapter.disconnect();
    expect(adapter.getConnectionState().status).toBe('disconnected');
  });
});
