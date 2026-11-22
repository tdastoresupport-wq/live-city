import {
  ILiveEventAdapter,
  LiveConnectionState,
  RawLiveComment,
  RawLiveGift,
  RawLiveLike,
} from '../types/adapter';
import { Deduplicator } from '../commands/Deduplicator';
import { CommandParser } from '../commands/CommandParser';
import { generateId } from '../utils/id';
import {
  WebSocketBridgeTransport,
  validateBridgeUrl,
} from './WebSocketBridgeTransport';

export interface ExternalStreamPayload {
  type: 'comment' | 'gift' | 'like' | 'connected' | 'disconnected' | 'error';
  eventId?: string;
  userId?: string;
  uniqueId?: string;
  nickname?: string;
  comment?: string;
  giftName?: string;
  repeatCount?: number;
  diamondCount?: number;
  likeCount?: number;
  totalLikeCount?: number;
  timestamp?: number;
  error?: string;
}

export interface BridgeTransportConnectOptions {
  requireAck?: boolean;
  ackTimeoutMs?: number;
  connectTimeoutMs?: number;
  allowLoopback?: boolean;
  allowedHosts?: string[];
}

export interface ILiveBridgeTransport {
  connect(
    channelId: string,
    bridgeUrl: string,
    options?: BridgeTransportConnectOptions
  ): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(cb: (payload: ExternalStreamPayload) => void): () => void;
  onClose(cb: (reason?: string) => void): () => void;
  isSubscriptionVerified?(): boolean;
}

export interface TikTokLiveAdapterOptions {
  channelId?: string;
  bridgeUrl?: string;
  transport?: ILiveBridgeTransport;
  connectTimeoutMs?: number;
  baseBackoffMs?: number;
  maxReconnectAttempts?: number;
  maxReplayAgeMs?: number;
  requireAck?: boolean;
}

/**
 * Isolated TikTok LIVE Event Adapter (Experimental / Bridge-based).
 *
 * IMPORTANT ARCHITECTURAL NOTE:
 * TikTok does not provide a public browser-direct unauthenticated WebSocket API.
 * This adapter connects either through an injected transport or a local Webcast Bridge
 * (e.g. ws://127.0.0.1:21213 or webhook ingestion into the local server).
 * It NEVER fakes a 'connected' status if no real bridge or transport responds.
 */
export class TikTokLiveAdapter implements ILiveEventAdapter {
  private commentCallbacks: Set<(comment: RawLiveComment) => void> = new Set();
  private giftCallbacks: Set<(gift: RawLiveGift) => void> = new Set();
  private likeCallbacks: Set<(like: RawLiveLike) => void> = new Set();
  private stateCallbacks: Set<(state: LiveConnectionState) => void> = new Set();

  private deduplicator: Deduplicator;
  private options: Required<
    Pick<
      TikTokLiveAdapterOptions,
      'connectTimeoutMs' | 'baseBackoffMs' | 'maxReconnectAttempts' | 'maxReplayAgeMs'
    >
  > &
    TikTokLiveAdapterOptions;

  private connectionState: LiveConnectionState;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnect = false;
  private transportUnsubscribers: Array<() => void> = [];

  constructor(options: TikTokLiveAdapterOptions = {}) {
    this.options = {
      connectTimeoutMs: options.connectTimeoutMs ?? 5000,
      baseBackoffMs: options.baseBackoffMs ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 3,
      maxReplayAgeMs: options.maxReplayAgeMs ?? 120_000,
      ...options,
    };

    this.deduplicator = new Deduplicator(120_000, 5000);

    this.connectionState = {
      status: 'disconnected',
      platform: 'tiktok_experimental',
      channelId: options.channelId || '',
      isExperimental: true,
      eventsReceived: 0,
      reconnectAttempts: 0,
    };
  }

  public getConnectionState(): LiveConnectionState {
    return { ...this.connectionState };
  }

  public isConnected(): boolean {
    return this.connectionState.status === 'connected';
  }

  public onStateChange(callback: (state: LiveConnectionState) => void): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  public onComment(callback: (comment: RawLiveComment) => void): () => void {
    this.commentCallbacks.add(callback);
    return () => this.commentCallbacks.delete(callback);
  }

  public onGift(callback: (gift: RawLiveGift) => void): () => void {
    this.giftCallbacks.add(callback);
    return () => this.giftCallbacks.delete(callback);
  }

  public onLike(callback: (like: RawLiveLike) => void): () => void {
    this.likeCallbacks.add(callback);
    return () => this.likeCallbacks.delete(callback);
  }

  public async connect(connectOpts?: {
    channelId?: string;
    bridgeUrl?: string;
    transport?: ILiveBridgeTransport;
    requireAck?: boolean;
  }): Promise<void> {
    this.clearReconnectTimer();
    this.manualDisconnect = false;

    const channelId = (connectOpts?.channelId ?? this.options.channelId ?? '').trim();
    let bridgeUrl = (connectOpts?.bridgeUrl ?? this.options.bridgeUrl ?? '').trim();
    this.options.channelId = channelId;

    if (!channelId) {
      this.updateState({
        status: 'error',
        errorMessage: 'Thiếu TikTok Channel ID (@username). Không thể kết nối.',
        subscriptionVerified: false,
      });
      throw new Error('Missing TikTok channelId');
    }

    // 1. Dynamic Transport Injection or Replacement:
    if (connectOpts?.transport) {
      if (this.options.transport && this.options.transport !== connectOpts.transport) {
        await this.options.transport.disconnect().catch(() => {});
      }
      this.options.transport = connectOpts.transport;
    } else if (bridgeUrl) {
      const validation = validateBridgeUrl(bridgeUrl);
      if (!validation.valid || !validation.normalized) {
        this.updateState({
          status: 'error',
          errorMessage: validation.error || 'Định dạng URL của Bridge không hợp lệ.',
          subscriptionVerified: false,
        });
        throw new Error(validation.error || 'Invalid bridge URL');
      }
      bridgeUrl = validation.normalized;
      this.options.bridgeUrl = bridgeUrl;

      // If no transport exists or if bridgeUrl has changed, replace transport cleanly
      if (
        !this.options.transport ||
        (this.options.transport instanceof WebSocketBridgeTransport &&
          connectOpts?.bridgeUrl !== undefined)
      ) {
        if (this.options.transport) {
          await this.options.transport.disconnect().catch(() => {});
        }
        this.options.transport = new WebSocketBridgeTransport();
      }
    }

    this.updateState({
      status: this.connectionState.reconnectAttempts > 0 ? 'reconnecting' : 'connecting',
      channelId,
      errorMessage: undefined,
    });

    // If neither an injected transport nor a local bridge URL is configured, report honest BLOCKED/ERROR state
    if (!this.options.transport && !this.options.bridgeUrl) {
      this.updateState({
        status: 'error',
        errorMessage:
          'Chưa cấu hình TikTok Bridge/Connector (TIKTOK_BRIDGE_URL). Đang ở chế độ chờ tích hợp thật.',
        subscriptionVerified: false,
      });
      throw new Error('TIKTOK_BRIDGE_NOT_CONFIGURED');
    }

    const requireAck = connectOpts?.requireAck ?? this.options.requireAck ?? false;

    try {
      await this.connectWithTimeout(channelId, this.options.bridgeUrl || '', requireAck);
      const isVerified = this.options.transport?.isSubscriptionVerified
        ? this.options.transport.isSubscriptionVerified()
        : undefined;
      this.updateState({
        status: 'connected',
        channelId,
        connectedAt: Date.now(),
        reconnectAttempts: 0,
        subscriptionVerified: isVerified,
        errorMessage: undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kết nối TikTok Bridge thất bại';
      this.updateState({
        status: 'error',
        errorMessage: msg,
        subscriptionVerified: false,
      });
      this.scheduleReconnectIfAllowed();
      throw err;
    }
  }

  private async connectWithTimeout(
    channelId: string,
    bridgeUrl: string,
    requireAck?: boolean
  ): Promise<void> {
    this.cleanupTransportListeners();
    const transport = this.options.transport;
    if (!transport) {
      throw new Error(
        `Không tìm thấy dịch vụ TikTok Bridge tại ${bridgeUrl || 'localhost'}. Hãy khởi chạy bridge hoặc dùng Webhook/Mock.`
      );
    }

    const unsubMsg = transport.onMessage((payload) => this.handleIncomingPayload(payload));
    const unsubClose = transport.onClose((reason) => this.handleUnexpectedClose(reason));
    this.transportUnsubscribers.push(unsubMsg, unsubClose);

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Quá thời gian chờ kết nối (${this.options.connectTimeoutMs}ms)`));
      }, this.options.connectTimeoutMs);
    });

    try {
      await Promise.race([
        transport.connect(channelId, bridgeUrl, {
          connectTimeoutMs: this.options.connectTimeoutMs,
          requireAck,
        }),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private handleUnexpectedClose(reason?: string): void {
    if (this.manualDisconnect) return;
    this.updateState({
      status: 'error',
      errorMessage: reason || 'Mất kết nối tới nguồn sự kiện livestream.',
      subscriptionVerified: false,
    });
    this.scheduleReconnectIfAllowed();
  }

  private scheduleReconnectIfAllowed(): void {
    if (this.manualDisconnect) return;
    if (this.connectionState.reconnectAttempts >= this.options.maxReconnectAttempts) {
      return;
    }

    const attempt = this.connectionState.reconnectAttempts + 1;
    const delayMs = this.options.baseBackoffMs * Math.pow(2, attempt - 1);

    this.updateState({
      status: 'reconnecting',
      reconnectAttempts: attempt,
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Error state already updated in connect()
      });
    }, delayMs);
  }

  public async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.cleanupTransportListeners();

    if (this.options.transport) {
      await this.options.transport.disconnect().catch(() => {});
    }

    this.updateState({
      status: 'disconnected',
      connectedAt: undefined,
      reconnectAttempts: 0,
      subscriptionVerified: false,
    });
  }

  /**
   * Normalizes and validates an incoming external stream payload (from Bridge or Webhook).
   * Protects against replay attacks, duplicate IDs, and malformed payloads.
   */
  public handleIncomingPayload(payload: ExternalStreamPayload): boolean {
    try {
      if (!payload || typeof payload !== 'object') return false;

      const now = Date.now();
      let eventTs = now;
      const rawTs = Number(payload.timestamp);
      if (Number.isFinite(rawTs) && rawTs > 0) {
        // Automatically normalize Unix timestamp seconds into milliseconds
        eventTs = rawTs < 1e11 ? Math.floor(rawTs * 1000) : Math.floor(rawTs);
      }

      // Anti-replay check: reject events older than maxReplayAgeMs or too far in the future
      if (Math.abs(now - eventTs) > this.options.maxReplayAgeMs) {
        return false;
      }

      const rawUserId = String(payload.userId ?? payload.uniqueId ?? '').trim();
      if (!rawUserId && ['comment', 'gift', 'like'].includes(payload.type)) {
        return false;
      }

      const rawEventId = payload.eventId != null ? String(payload.eventId).trim() : '';
      const eventId = rawEventId || generateId(`tt_${payload.type}`);
      if (!this.deduplicator.isUnique(eventId, now)) {
        return false; // Duplicate rejected
      }

      const userName = CommandParser.sanitizeText(
        String(payload.nickname ?? payload.uniqueId ?? rawUserId),
        36
      );

      if (payload.type === 'comment') {
        const text = CommandParser.sanitizeText(String(payload.comment ?? ''), 80);
        if (!text || !text.trim()) return false;

        const normalized: RawLiveComment = {
          id: eventId,
          userId: rawUserId,
          userName,
          comment: text,
          timestamp: eventTs,
        };

        this.connectionState.eventsReceived += 1;
        this.connectionState.lastEventAt = now;
        this.connectionState.subscriptionVerified = true;
        for (const cb of this.commentCallbacks) {
          cb(normalized);
        }
        return true;
      }

      if (payload.type === 'gift') {
        const giftCount = Math.max(1, Math.min(99999, Math.floor(Number(payload.repeatCount) || 1)));
        const diamondValue = Math.max(0, Math.min(1000000, Math.floor(Number(payload.diamondCount) || 0)));

        const normalized: RawLiveGift = {
          id: eventId,
          userId: rawUserId,
          userName,
          giftName: CommandParser.sanitizeText(String(payload.giftName || 'Gift'), 36),
          giftCount,
          diamondValue,
          timestamp: eventTs,
        };

        this.connectionState.eventsReceived += 1;
        this.connectionState.lastEventAt = now;
        this.connectionState.subscriptionVerified = true;
        for (const cb of this.giftCallbacks) {
          cb(normalized);
        }
        return true;
      }

      if (payload.type === 'like') {
        const likeCount = Math.max(1, Math.min(10000, Math.floor(Number(payload.likeCount) || 1)));
        const totalLikes = Math.max(1, Math.floor(Number(payload.totalLikeCount) || likeCount));

        const normalized: RawLiveLike = {
          id: eventId,
          userId: rawUserId,
          userName,
          likeCount,
          totalLikes,
          timestamp: eventTs,
        };

        this.connectionState.eventsReceived += 1;
        this.connectionState.lastEventAt = now;
        this.connectionState.subscriptionVerified = true;
        for (const cb of this.likeCallbacks) {
          cb(normalized);
        }
        return true;
      }

      return false;
    } catch {
      // Never allow malformed external event to crash the engine
      return false;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cleanupTransportListeners(): void {
    for (const unsub of this.transportUnsubscribers) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    this.transportUnsubscribers = [];
  }

  private updateState(patch: Partial<LiveConnectionState>): void {
    this.connectionState = {
      ...this.connectionState,
      ...patch,
    };
    const snap = this.getConnectionState();
    for (const cb of this.stateCallbacks) {
      try {
        cb(snap);
      } catch {
        // ignore listener error
      }
    }
  }
}
