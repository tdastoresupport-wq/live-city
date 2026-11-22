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

export interface ILiveBridgeTransport {
  connect(channelId: string, bridgeUrl: string): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(cb: (payload: ExternalStreamPayload) => void): () => void;
  onClose(cb: (reason?: string) => void): () => void;
}

export interface TikTokLiveAdapterOptions {
  channelId?: string;
  bridgeUrl?: string;
  transport?: ILiveBridgeTransport;
  connectTimeoutMs?: number;
  baseBackoffMs?: number;
  maxReconnectAttempts?: number;
  maxReplayAgeMs?: number;
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

  public async connect(connectOpts?: { channelId?: string; bridgeUrl?: string }): Promise<void> {
    this.clearReconnectTimer();
    this.manualDisconnect = false;

    const channelId = (connectOpts?.channelId ?? this.options.channelId ?? '').trim();
    const bridgeUrl = (connectOpts?.bridgeUrl ?? this.options.bridgeUrl ?? '').trim();
    this.options.channelId = channelId;
    if (bridgeUrl) this.options.bridgeUrl = bridgeUrl;

    if (!channelId) {
      this.updateState({
        status: 'error',
        errorMessage: 'Thiếu TikTok Channel ID (@username). Không thể kết nối.',
      });
      throw new Error('Missing TikTok channelId');
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
      });
      throw new Error('TIKTOK_BRIDGE_NOT_CONFIGURED');
    }

    try {
      await this.connectWithTimeout(channelId, this.options.bridgeUrl || '');
      this.updateState({
        status: 'connected',
        channelId,
        connectedAt: Date.now(),
        reconnectAttempts: 0,
        errorMessage: undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kết nối TikTok Bridge thất bại';
      this.updateState({
        status: 'error',
        errorMessage: msg,
      });
      this.scheduleReconnectIfAllowed();
      throw err;
    }
  }

  private async connectWithTimeout(channelId: string, bridgeUrl: string): Promise<void> {
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
      await Promise.race([transport.connect(channelId, bridgeUrl), timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private handleUnexpectedClose(reason?: string): void {
    if (this.manualDisconnect) return;
    this.updateState({
      status: 'error',
      errorMessage: reason || 'Mất kết nối tới nguồn sự kiện livestream.',
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
      const eventTs =
        typeof payload.timestamp === 'number' && Number.isFinite(payload.timestamp)
          ? payload.timestamp
          : now;

      // Anti-replay check: reject events older than maxReplayAgeMs or too far in the future
      if (Math.abs(now - eventTs) > this.options.maxReplayAgeMs) {
        return false;
      }

      const rawUserId = (payload.userId || payload.uniqueId || '').trim();
      if (!rawUserId && ['comment', 'gift', 'like'].includes(payload.type)) {
        return false;
      }

      const eventId = (payload.eventId || generateId(`tt_${payload.type}`)).trim();
      if (!this.deduplicator.isUnique(eventId, now)) {
        return false; // Duplicate rejected
      }

      const userName = CommandParser.sanitizeText(
        payload.nickname || payload.uniqueId || rawUserId,
        36
      );

      if (payload.type === 'comment') {
        const text = CommandParser.sanitizeText(payload.comment || '', 80);
        if (!text) return false;

        const normalized: RawLiveComment = {
          id: eventId,
          userId: rawUserId,
          userName,
          comment: text,
          timestamp: eventTs,
        };

        this.connectionState.eventsReceived += 1;
        this.connectionState.lastEventAt = now;
        for (const cb of this.commentCallbacks) {
          cb(normalized);
        }
        return true;
      }

      if (payload.type === 'gift') {
        const normalized: RawLiveGift = {
          id: eventId,
          userId: rawUserId,
          userName,
          giftName: CommandParser.sanitizeText(payload.giftName || 'Gift', 36),
          giftCount: Math.max(1, Number(payload.repeatCount) || 1),
          diamondValue: Math.max(0, Number(payload.diamondCount) || 0),
          timestamp: eventTs,
        };

        this.connectionState.eventsReceived += 1;
        this.connectionState.lastEventAt = now;
        for (const cb of this.giftCallbacks) {
          cb(normalized);
        }
        return true;
      }

      if (payload.type === 'like') {
        const normalized: RawLiveLike = {
          id: eventId,
          userId: rawUserId,
          userName,
          likeCount: Math.max(1, Number(payload.likeCount) || 1),
          totalLikes: Math.max(1, Number(payload.totalLikeCount) || 1),
          timestamp: eventTs,
        };

        this.connectionState.eventsReceived += 1;
        this.connectionState.lastEventAt = now;
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
