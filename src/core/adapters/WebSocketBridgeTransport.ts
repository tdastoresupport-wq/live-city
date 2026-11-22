import {
  ExternalStreamPayload,
  ILiveBridgeTransport,
} from './TikTokLiveAdapter';

/**
 * Production WebSocket Bridge Transport for connecting to external live bridges
 * (e.g. TikTok Webcast Bridge server running on ws://127.0.0.1:21213 or similar).
 */
export class WebSocketBridgeTransport implements ILiveBridgeTransport {
  private ws: WebSocket | null = null;
  private messageCallbacks: Set<(payload: ExternalStreamPayload) => void> = new Set();
  private closeCallbacks: Set<(reason?: string) => void> = new Set();
  private isManualDisconnect = false;
  private activeChannelId = '';
  private activeBridgeUrl = '';

  public onMessage(cb: (payload: ExternalStreamPayload) => void): () => void {
    this.messageCallbacks.add(cb);
    return () => this.messageCallbacks.delete(cb);
  }

  public onClose(cb: (reason?: string) => void): () => void {
    this.closeCallbacks.add(cb);
    return () => this.closeCallbacks.delete(cb);
  }

  public async connect(channelId: string, bridgeUrl: string): Promise<void> {
    this.isManualDisconnect = false;
    this.activeChannelId = channelId.trim();
    this.activeBridgeUrl = bridgeUrl.trim();

    if (!this.activeBridgeUrl) {
      throw new Error('Bridge URL is required for WebSocket bridge transport');
    }

    // Validate WebSocket protocol
    let parsed: URL;
    try {
      parsed = new URL(this.activeBridgeUrl);
    } catch {
      throw new Error(`Invalid bridge URL format: ${this.activeBridgeUrl}`);
    }

    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      throw new Error(
        `Invalid protocol '${parsed.protocol}'. WebSocket bridge requires 'ws:' or 'wss:'`
      );
    }

    if (typeof globalThis.WebSocket === 'undefined') {
      throw new Error('WebSocket client is not available in current runtime environment');
    }

    await this.disconnect();

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      try {
        const socket = new globalThis.WebSocket(this.activeBridgeUrl);
        this.ws = socket;

        timeoutHandle = setTimeout(() => {
          if (!settled) {
            settled = true;
            try {
              socket.close();
            } catch {
              // ignore
            }
            reject(new Error(`WebSocket bridge connection timed out at ${this.activeBridgeUrl}`));
          }
        }, 5000);

        socket.onopen = () => {
          if (!settled) {
            settled = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);

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
              } catch {
                // Ignore send error
              }
            }

            resolve();
          }
        };

        socket.onmessage = (event) => {
          this.handleRawMessage(event.data);
        };

        socket.onerror = (err: Event) => {
          if (!settled) {
            settled = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            const msg = (err as { message?: string }).message || 'WebSocket connection error';
            reject(new Error(msg));
          }
        };

        socket.onclose = (event: CloseEvent) => {
          if (!settled) {
            settled = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            reject(new Error(`WebSocket bridge closed before connection: code ${event.code}`));
          } else {
            if (!this.isManualDisconnect) {
              const reason = event.reason || `Bridge disconnected (code ${event.code})`;
              for (const cb of this.closeCallbacks) {
                cb(reason);
              }
            }
          }
        };
      } catch (err) {
        if (!settled) {
          settled = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });
  }

  public async disconnect(): Promise<void> {
    this.isManualDisconnect = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  private handleRawMessage(raw: unknown): void {
    if (typeof raw !== 'string' && !(raw instanceof Buffer)) {
      return;
    }

    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
      const parsed = JSON.parse(text);

      const normalized = this.normalizePayload(parsed);
      if (normalized) {
        for (const cb of this.messageCallbacks) {
          cb(normalized);
        }
      }
    } catch {
      // Ignore unparseable frames
    }
  }

  /**
   * Normalizes payloads from diverse bridge conventions into ExternalStreamPayload.
   */
  private normalizePayload(raw: any): ExternalStreamPayload | null {
    if (!raw || typeof raw !== 'object') return null;

    // Convention A: Direct ExternalStreamPayload
    if (raw.type && ['comment', 'gift', 'like'].includes(raw.type)) {
      return {
        type: raw.type,
        eventId: typeof raw.eventId === 'string' ? raw.eventId : undefined,
        userId: typeof raw.userId === 'string' ? raw.userId : undefined,
        uniqueId: typeof raw.uniqueId === 'string' ? raw.uniqueId : undefined,
        nickname: typeof raw.nickname === 'string' ? raw.nickname : undefined,
        comment: typeof raw.comment === 'string' ? raw.comment : undefined,
        giftName: typeof raw.giftName === 'string' ? raw.giftName : undefined,
        repeatCount: typeof raw.repeatCount === 'number' ? raw.repeatCount : undefined,
        diamondCount: typeof raw.diamondCount === 'number' ? raw.diamondCount : undefined,
        likeCount: typeof raw.likeCount === 'number' ? raw.likeCount : undefined,
        timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
      };
    }

    // Convention B: Event wrapper { event: 'chat' | 'gift' | 'like', data: { ... } }
    if (raw.event && raw.data) {
      const d = raw.data;
      if (raw.event === 'chat' || raw.event === 'comment') {
        return {
          type: 'comment',
          eventId: d.msgId || d.id || d.eventId,
          userId: d.userId || d.secUid || d.uniqueId,
          uniqueId: d.uniqueId || d.userId,
          nickname: d.nickname || d.uniqueId,
          comment: d.comment || d.text,
          timestamp: d.createTime || d.timestamp || Date.now(),
        };
      }
      if (raw.event === 'gift') {
        return {
          type: 'gift',
          eventId: d.msgId || d.id || d.eventId,
          userId: d.userId || d.uniqueId,
          uniqueId: d.uniqueId,
          nickname: d.nickname || d.uniqueId,
          giftName: d.giftName || d.gift?.name || 'Gift',
          repeatCount: d.repeatCount || d.count || 1,
          diamondCount: d.diamondCount || (d.repeatCount || 1) * 10,
          timestamp: d.createTime || d.timestamp || Date.now(),
        };
      }
      if (raw.event === 'like') {
        return {
          type: 'like',
          eventId: d.msgId || d.id || d.eventId,
          userId: d.userId || d.uniqueId,
          uniqueId: d.uniqueId,
          nickname: d.nickname || d.uniqueId,
          likeCount: d.likeCount || d.count || 1,
          timestamp: d.createTime || d.timestamp || Date.now(),
        };
      }
    }

    return null;
  }
}
