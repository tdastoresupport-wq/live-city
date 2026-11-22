import {
  ExternalStreamPayload,
  ILiveBridgeTransport,
  BridgeTransportConnectOptions,
} from './TikTokLiveAdapter';

/**
 * Validates bridge URLs to ensure valid WebSocket protocol and protect against SSRF targets.
 */
export function validateBridgeUrl(urlStr: string): {
  valid: boolean;
  normalized?: string;
  error?: string;
} {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, error: 'Bridge URL is required and must be a valid string.' };
  }
  const trimmed = urlStr.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: `Invalid bridge URL format: "${urlStr}".` };
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    return {
      valid: false,
      error: `Invalid bridge protocol "${parsed.protocol}", requires 'ws:' or 'wss:'.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  // Disallow cloud metadata and dangerous internal addresses
  if (
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal' ||
    hostname === '0.0.0.0'
  ) {
    return { valid: false, error: 'Target host is blocked for security reasons.' };
  }

  return { valid: true, normalized: parsed.toString() };
}

/**
 * Production WebSocket Bridge Transport for connecting to external live bridges
 * (e.g. TikTok Webcast Bridge server running on ws://127.0.0.1:21213 or similar).
 */
export class WebSocketBridgeTransport implements ILiveBridgeTransport {
  private ws: WebSocket | null = null;
  private messageCallbacks: Set<(payload: ExternalStreamPayload) => void> = new Set();
  private closeCallbacks: Set<(reason?: string) => void> = new Set();
  private isManualDisconnect = false;
  private isConnected = false;
  private isSubscribed = false;
  private activeChannelId = '';
  private activeBridgeUrl = '';
  private connectionGen = 0;

  public onMessage(cb: (payload: ExternalStreamPayload) => void): () => void {
    this.messageCallbacks.add(cb);
    return () => this.messageCallbacks.delete(cb);
  }

  public onClose(cb: (reason?: string) => void): () => void {
    this.closeCallbacks.add(cb);
    return () => this.closeCallbacks.delete(cb);
  }

  public isSubscriptionVerified(): boolean {
    return this.isSubscribed;
  }

  public isSocketConnected(): boolean {
    return this.isConnected;
  }

  public async connect(
    channelId: string,
    bridgeUrl: string,
    options?: BridgeTransportConnectOptions
  ): Promise<void> {
    // 1. Cleanly disconnect previous connection if any
    await this.disconnect();

    // 2. CRITICAL: Reset manual disconnect flag for the new connection attempt
    this.isManualDisconnect = false;
    this.isConnected = false;
    this.isSubscribed = false;
    this.activeChannelId = String(channelId || '').trim();

    // 3. Validate bridge URL
    const validation = validateBridgeUrl(bridgeUrl);
    if (!validation.valid || !validation.normalized) {
      throw new Error(validation.error || 'Invalid bridge URL');
    }
    this.activeBridgeUrl = validation.normalized;

    if (typeof globalThis.WebSocket === 'undefined') {
      throw new Error('WebSocket client is not available in current runtime environment');
    }

    const currentGen = ++this.connectionGen;
    const connectTimeoutMs = options?.connectTimeoutMs ?? 5000;
    const requireAck = options?.requireAck ?? false;
    const ackTimeoutMs = options?.ackTimeoutMs ?? 2500;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let connectTimer: ReturnType<typeof setTimeout> | null = null;
      let ackTimer: ReturnType<typeof setTimeout> | null = null;

      const clearAllTimers = () => {
        if (connectTimer) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
        if (ackTimer) {
          clearTimeout(ackTimer);
          ackTimer = null;
        }
      };

      const safeResolve = () => {
        if (!settled && this.connectionGen === currentGen) {
          settled = true;
          clearAllTimers();
          resolve();
        }
      };

      const safeReject = (err: Error) => {
        if (!settled && this.connectionGen === currentGen) {
          settled = true;
          clearAllTimers();
          reject(err);
        }
      };

      try {
        const socket = new globalThis.WebSocket(this.activeBridgeUrl);
        this.ws = socket;

        // Overall connect timeout
        connectTimer = setTimeout(() => {
          if (!settled && this.connectionGen === currentGen) {
            try {
              socket.close();
            } catch {
              // ignore
            }
            safeReject(
              new Error(`WebSocket bridge connection timed out at ${this.activeBridgeUrl}`)
            );
          }
        }, connectTimeoutMs);

        socket.onopen = () => {
          if (this.connectionGen !== currentGen || this.ws !== socket) return;

          this.isConnected = true;

          // Send subscription handshake if channelId is specified
          if (this.activeChannelId) {
            try {
              socket.send(
                JSON.stringify({
                  action: 'subscribe',
                  platform: 'tiktok',
                  channelId: this.activeChannelId,
                })
              );
            } catch (err) {
              safeReject(
                err instanceof Error ? err : new Error('Failed to send subscribe frame')
              );
              return;
            }
          }

          if (requireAck) {
            // Require explicit ACK or incoming event from the bridge
            ackTimer = setTimeout(() => {
              if (!settled && this.connectionGen === currentGen) {
                try {
                  socket.close();
                } catch {
                  // ignore
                }
                safeReject(
                  new Error('Bridge handshake acknowledgement timed out: subscribe unverified')
                );
              }
            }, ackTimeoutMs);
          } else {
            // Non-strict mode: give 300ms window for immediate error frame, else resolve
            ackTimer = setTimeout(() => {
              safeResolve();
            }, 300);
          }
        };

        socket.onmessage = (event) => {
          if (this.connectionGen !== currentGen || this.ws !== socket) return;

          const rawData = event.data;
          if (typeof rawData !== 'string' && !(rawData instanceof Buffer)) {
            return;
          }

          try {
            const text = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
            const parsed = JSON.parse(text);

            // 1. Check for Handshake ACK / Connected control frame
            if (this.isAckControlFrame(parsed)) {
              this.isSubscribed = true;
              safeResolve();
              return;
            }

            // 2. Check for Bridge Error control frame
            if (this.isErrorControlFrame(parsed)) {
              const errMsg =
                parsed.message ||
                parsed.error ||
                (parsed.data && parsed.data.error) ||
                'Bridge returned error response';
              if (!settled) {
                safeReject(new Error(errMsg));
                return;
              }
            }

            // 3. Normal stream payload
            const normalized = this.normalizePayload(parsed);
            if (normalized) {
              // Receiving live events confirms active subscription
              this.isSubscribed = true;
              safeResolve();

              for (const cb of this.messageCallbacks) {
                cb(normalized);
              }
            }
          } catch {
            // Ignore unparseable frames safely
          }
        };

        socket.onerror = (err: Event) => {
          if (this.connectionGen !== currentGen || this.ws !== socket) return;
          const msg = (err as { message?: string }).message || 'WebSocket connection error';
          safeReject(new Error(msg));
        };

        socket.onclose = (event: CloseEvent) => {
          if (this.connectionGen !== currentGen || this.ws !== socket) return;

          clearAllTimers();
          this.isConnected = false;
          this.isSubscribed = false;

          if (!settled) {
            safeReject(
              new Error(
                `WebSocket bridge closed before connection established (code ${event.code})`
              )
            );
          } else {
            // Emit unexpected disconnect only if not manually disconnected
            if (!this.isManualDisconnect) {
              const reason = event.reason || `Bridge disconnected (code ${event.code})`;
              for (const cb of this.closeCallbacks) {
                cb(reason);
              }
            }
          }
        };
      } catch (err) {
        safeReject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  public async disconnect(): Promise<void> {
    this.isManualDisconnect = true;
    this.isConnected = false;
    this.isSubscribed = false;
    this.connectionGen++;

    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      try {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      } catch {
        // ignore
      }
    }
  }

  private isAckControlFrame(parsed: any): boolean {
    if (!parsed || typeof parsed !== 'object') return false;

    if (
      parsed.action === 'ack' ||
      parsed.action === 'subscribed' ||
      parsed.type === 'ack' ||
      parsed.type === 'connected' ||
      parsed.event === 'subscribed' ||
      parsed.event === 'connected'
    ) {
      return true;
    }

    if (
      typeof parsed.status === 'string' &&
      ['subscribed', 'connected', 'ok', 'success'].includes(parsed.status.toLowerCase())
    ) {
      return true;
    }

    return false;
  }

  private isErrorControlFrame(parsed: any): boolean {
    if (!parsed || typeof parsed !== 'object') return false;

    if (parsed.status === 'error' || parsed.event === 'error' || parsed.type === 'error') {
      return true;
    }

    if (parsed.error && typeof parsed.error === 'string') {
      return true;
    }

    return false;
  }

  /**
   * Normalizes payloads from diverse bridge conventions into ExternalStreamPayload.
   * Handles string/number IDs, seconds/milliseconds timestamps, missing fields safely.
   */
  public normalizePayload(raw: any): ExternalStreamPayload | null {
    if (!raw || typeof raw !== 'object') return null;

    try {
      // Helper: normalize timestamp (converts seconds to milliseconds if < 1e11)
      const parseTimestamp = (val: unknown): number => {
        const num = Number(val);
        if (Number.isFinite(num) && num > 0) {
          return num < 1e11 ? Math.floor(num * 1000) : Math.floor(num);
        }
        return Date.now();
      };

      // Helper: safe string extraction
      const safeString = (val: unknown): string | undefined => {
        if (val == null) return undefined;
        const str = String(val).trim();
        return str.length > 0 ? str : undefined;
      };

      // Helper: safe integer clamping
      const safeInt = (val: unknown, min: number, max: number, defaultVal: number): number => {
        const num = Number(val);
        if (Number.isFinite(num)) {
          return Math.max(min, Math.min(max, Math.floor(num)));
        }
        return defaultVal;
      };

      // Convention A: Direct ExternalStreamPayload { type: 'comment' | 'gift' | 'like', ... }
      if (raw.type && ['comment', 'gift', 'like'].includes(raw.type)) {
        const eventId = safeString(raw.eventId ?? raw.id ?? raw.msgId);
        const userId = safeString(raw.userId ?? raw.secUid ?? raw.uniqueId);
        const uniqueId = safeString(raw.uniqueId ?? raw.userId);
        const nickname = safeString(raw.nickname ?? raw.userName ?? uniqueId);

        if (!userId && !uniqueId) return null;

        if (raw.type === 'comment') {
          const comment = safeString(raw.comment ?? raw.text);
          if (!comment) return null; // Reject empty comment
          return {
            type: 'comment',
            eventId,
            userId,
            uniqueId,
            nickname,
            comment,
            timestamp: parseTimestamp(raw.timestamp ?? raw.createTime),
          };
        }

        if (raw.type === 'gift') {
          return {
            type: 'gift',
            eventId,
            userId,
            uniqueId,
            nickname,
            giftName: safeString(raw.giftName ?? raw.gift?.name) || 'Gift',
            repeatCount: safeInt(raw.repeatCount ?? raw.count ?? raw.giftCount, 1, 99999, 1),
            diamondCount: safeInt(raw.diamondCount ?? raw.diamonds, 0, 1000000, 0),
            timestamp: parseTimestamp(raw.timestamp ?? raw.createTime),
          };
        }

        if (raw.type === 'like') {
          return {
            type: 'like',
            eventId,
            userId,
            uniqueId,
            nickname,
            likeCount: safeInt(raw.likeCount ?? raw.count, 1, 10000, 1),
            totalLikeCount: safeInt(raw.totalLikeCount ?? raw.totalLikes, 1, 100000000, 1),
            timestamp: parseTimestamp(raw.timestamp ?? raw.createTime),
          };
        }
      }

      // Convention B: Event wrapper { event: 'chat' | 'gift' | 'like', data: { ... } }
      if (raw.event && raw.data && typeof raw.data === 'object') {
        const d = raw.data;
        const eventId = safeString(d.msgId ?? d.id ?? d.eventId ?? raw.msgId);
        const userId = safeString(d.userId ?? d.secUid ?? d.uniqueId);
        const uniqueId = safeString(d.uniqueId ?? d.userId);
        const nickname = safeString(d.nickname ?? d.userName ?? uniqueId);
        const timestamp = parseTimestamp(d.createTime ?? d.timestamp ?? raw.timestamp);

        if (!userId && !uniqueId) return null;

        if (raw.event === 'chat' || raw.event === 'comment') {
          const comment = safeString(d.comment ?? d.text);
          if (!comment) return null;
          return {
            type: 'comment',
            eventId,
            userId,
            uniqueId,
            nickname,
            comment,
            timestamp,
          };
        }

        if (raw.event === 'gift') {
          return {
            type: 'gift',
            eventId,
            userId,
            uniqueId,
            nickname,
            giftName: safeString(d.giftName ?? d.gift?.name) || 'Gift',
            repeatCount: safeInt(d.repeatCount ?? d.count ?? d.giftCount, 1, 99999, 1),
            diamondCount: safeInt(
              d.diamondCount ?? d.diamonds,
              0,
              1000000,
              safeInt(d.repeatCount ?? d.count, 1, 99999, 1) * 10
            ),
            timestamp,
          };
        }

        if (raw.event === 'like') {
          return {
            type: 'like',
            eventId,
            userId,
            uniqueId,
            nickname,
            likeCount: safeInt(d.likeCount ?? d.count, 1, 10000, 1),
            totalLikeCount: safeInt(d.totalLikeCount ?? d.totalLikes, 1, 100000000, 1),
            timestamp,
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}
