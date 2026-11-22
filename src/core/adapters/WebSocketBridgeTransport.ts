import {
  ExternalStreamPayload,
  ILiveBridgeTransport,
  BridgeTransportConnectOptions,
} from './TikTokLiveAdapter';

export interface ValidateBridgeUrlOptions {
  allowLoopback?: boolean;
  allowedHosts?: string[];
}

export function isIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d+$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost') return true;
  if (h.startsWith('127.')) return true;
  if (h === '::1' || h === '[::1]') return true;
  if (
    h === '::ffff:127.0.0.1' ||
    h === '[::ffff:127.0.0.1]' ||
    h === '[::ffff:7f00:1]' ||
    h === '::ffff:7f00:1'
  ) {
    return true;
  }
  return false;
}

export function isForbiddenPrivateOrMetadataIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24
  if (a >= 224) return true; // 224.0.0.0/4 (multicast & reserved)
  return false;
}

export function isForbiddenPrivateOrMetadataIpv6(raw: string): boolean {
  let ip = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  ip = ip.toLowerCase();
  if (ip === '::1' || ip === '::') return true;
  if (/^fe[89ab]/i.test(ip)) return true; // link-local fe80::/10
  if (/^f[cd]/i.test(ip)) return true; // unique local fc00::/7
  if (/^ff/i.test(ip)) return true; // multicast ff00::/8
  if (ip.startsWith('::ffff:')) {
    const sub = ip.slice(7);
    if (sub.includes('.')) {
      return isForbiddenPrivateOrMetadataIpv4(sub);
    }
    const hexParts = sub.split(':');
    if (hexParts.length === 2) {
      const p1 = parseInt(hexParts[0], 16);
      const p2 = parseInt(hexParts[1], 16);
      if (!isNaN(p1) && !isNaN(p2)) {
        const b1 = (p1 >> 8) & 0xff;
        const b2 = p1 & 0xff;
        const b3 = (p2 >> 8) & 0xff;
        const b4 = p2 & 0xff;
        return isForbiddenPrivateOrMetadataIpv4(`${b1}.${b2}.${b3}.${b4}`);
      }
    }
    return true;
  }
  return false;
}

/**
 * Resolves DNS hostname dynamically in Node environment to detect private/loopback rebinding.
 */
export async function resolveDnsHostnames(hostname: string): Promise<string[]> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return [];
  }
  try {
    const dns = await import('node:dns');
    const records = await dns.promises.lookup(hostname, { all: true });
    return records.map((r) => r.address);
  } catch {
    return [];
  }
}

/**
 * Synchronous URL and address structure validator.
 */
export function validateBridgeUrl(
  urlStr: string,
  options?: ValidateBridgeUrlOptions
): {
  valid: boolean;
  normalized?: string;
  error?: string;
} {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, error: 'Bridge URL is required and must be a valid string.' };
  }
  const trimmed = urlStr.trim();
  if (trimmed.includes('#')) {
    return {
      valid: false,
      error: "Bridge URL contains fragment ('#'), which is forbidden by RFC 6455.",
    };
  }

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

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: 'Bridge URL credentials (username/password) are forbidden for security reasons.',
    };
  }

  if (parsed.port) {
    const portNum = Number(parsed.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return { valid: false, error: 'Invalid port number: must be between 1 and 65535.' };
    }
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return { valid: false, error: 'Bridge URL host is missing or invalid.' };
  }

  // Explicit cloud metadata and forbidden hostnames
  if (
    hostname === '169.254.169.254' ||
    hostname === '169.254.169.253' ||
    hostname === 'metadata.google.internal' ||
    hostname === '0.0.0.0'
  ) {
    return { valid: false, error: 'Target host is blocked for security reasons.' };
  }

  // Local loopback policy
  if (isLoopbackHost(hostname)) {
    if (options?.allowLoopback === false) {
      return { valid: false, error: 'Loopback bridge address is not permitted by policy.' };
    }
    return { valid: true, normalized: parsed.toString() };
  }

  // Non-loopback targets: check raw IPv4
  if (isIpv4(hostname)) {
    if (isForbiddenPrivateOrMetadataIpv4(hostname)) {
      return {
        valid: false,
        error: 'Target IP address is in a private, link-local, or metadata address range.',
      };
    }
  } else if (hostname.startsWith('[') || hostname.includes(':')) {
    // Non-loopback raw IPv6
    if (isForbiddenPrivateOrMetadataIpv6(hostname)) {
      return {
        valid: false,
        error: 'Target IPv6 address is in a private, link-local, or metadata address range.',
      };
    }
  } else {
    // Internal domain suffix defense
    if (
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.localhost')
    ) {
      return {
        valid: false,
        error: 'Internal domain names are blocked for security reasons.',
      };
    }

    // Remote host allowlist check if configured
    if (options?.allowedHosts && options.allowedHosts.length > 0) {
      const allowed = options.allowedHosts.map((h) => h.toLowerCase());
      if (!allowed.includes(hostname)) {
        return {
          valid: false,
          error: `Target host "${hostname}" is not in allowed bridge hosts list.`,
        };
      }
    }
  }

  return { valid: true, normalized: parsed.toString() };
}

/**
 * Asynchronous validator with DNS pre-flight check to mitigate SSRF & DNS rebinding.
 */
export async function validateBridgeUrlAsync(
  urlStr: string,
  options?: ValidateBridgeUrlOptions
): Promise<{
  valid: boolean;
  normalized?: string;
  error?: string;
}> {
  const syncResult = validateBridgeUrl(urlStr, options);
  if (!syncResult.valid || !syncResult.normalized) {
    return syncResult;
  }

  try {
    const parsed = new URL(syncResult.normalized);
    const hostname = parsed.hostname.toLowerCase();

    // If not a raw IP and not localhost loopback, check resolved DNS addresses
    if (!isIpv4(hostname) && !hostname.startsWith('[') && hostname !== 'localhost') {
      const resolvedAddresses = await resolveDnsHostnames(hostname);
      for (const addr of resolvedAddresses) {
        if (isIpv4(addr) && (isForbiddenPrivateOrMetadataIpv4(addr) || addr.startsWith('127.'))) {
          return {
            valid: false,
            error: `Target domain "${hostname}" resolves to forbidden IP address: ${addr}`,
          };
        }
        if (isForbiddenPrivateOrMetadataIpv6(addr) || addr === '::1') {
          return {
            valid: false,
            error: `Target domain "${hostname}" resolves to forbidden IPv6 address: ${addr}`,
          };
        }
      }
    }
  } catch {
    // If URL parsing fails in async phase, syncResult already caught it
  }

  return syncResult;
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
    const validation = await validateBridgeUrlAsync(bridgeUrl, {
      allowLoopback: options?.allowLoopback ?? true,
      allowedHosts: options?.allowedHosts,
    });
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

            // 1. Evaluate control frames strictly
            const ctrl = this.evaluateControlFrame(parsed);
            if (ctrl.isControl) {
              if (ctrl.isError) {
                const errMsg = ctrl.errorReason || 'Bridge returned error response';
                if (!settled) {
                  try {
                    socket.close();
                  } catch {
                    // ignore
                  }
                  safeReject(new Error(errMsg));
                  return;
                }
              } else if (ctrl.isPositiveAck) {
                this.isSubscribed = true;
                safeResolve();
                return;
              } else if (ctrl.isSocketConnectedOnly) {
                this.isConnected = true;
                if (!requireAck) {
                  setTimeout(() => {
                    safeResolve();
                  }, 100);
                }
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

  private evaluateControlFrame(parsed: any): {
    isControl: boolean;
    isError: boolean;
    isPositiveAck: boolean;
    isSocketConnectedOnly: boolean;
    errorReason?: string;
  } {
    if (!parsed || typeof parsed !== 'object') {
      return { isControl: false, isError: false, isPositiveAck: false, isSocketConnectedOnly: false };
    }

    const norm = (val: unknown): string =>
      String(val || '')
        .replace(/^@/, '')
        .toLowerCase()
        .trim();

    // A. Check for error frames or error status
    const isError =
      parsed.status === 'error' ||
      parsed.event === 'error' ||
      parsed.type === 'error' ||
      (parsed.action === 'ack' && parsed.status === 'error') ||
      Boolean(parsed.error && typeof parsed.error === 'string');

    if (isError) {
      const errorReason =
        parsed.message ||
        parsed.error ||
        (parsed.data && parsed.data.error) ||
        'Bridge returned error response';
      return {
        isControl: true,
        isError: true,
        isPositiveAck: false,
        isSocketConnectedOnly: false,
        errorReason,
      };
    }

    // B. Check for subscription ACK candidate
    const isAckCandidate =
      (parsed.action === 'ack' &&
        ['subscribed', 'ok', 'success'].includes(String(parsed.status || '').toLowerCase())) ||
      parsed.action === 'subscribed' ||
      (parsed.type === 'ack' &&
        ['subscribed', 'ok', 'success'].includes(String(parsed.status || '').toLowerCase())) ||
      parsed.event === 'subscribed' ||
      parsed.status === 'subscribed';

    if (isAckCandidate) {
      const channelInFrame =
        parsed.channelId ??
        parsed.channel ??
        parsed.uniqueId ??
        parsed.data?.channelId ??
        parsed.data?.uniqueId;

      if (channelInFrame) {
        const expectedNorm = norm(this.activeChannelId);
        const receivedNorm = norm(channelInFrame);
        if (expectedNorm && receivedNorm && expectedNorm !== receivedNorm) {
          return {
            isControl: true,
            isError: true,
            isPositiveAck: false,
            isSocketConnectedOnly: false,
            errorReason: `Subscription ACK channel mismatch: expected "${this.activeChannelId}", got "${channelInFrame}"`,
          };
        }
      }
      return {
        isControl: true,
        isError: false,
        isPositiveAck: true,
        isSocketConnectedOnly: false,
      };
    }

    // C. Check for generic connected frames (transport level only)
    const isGenericConnected =
      parsed.type === 'connected' ||
      parsed.event === 'connected' ||
      (parsed.status === 'connected' && parsed.action !== 'ack');

    if (isGenericConnected) {
      return {
        isControl: true,
        isError: false,
        isPositiveAck: false,
        isSocketConnectedOnly: true,
      };
    }

    return {
      isControl: false,
      isError: false,
      isPositiveAck: false,
      isSocketConnectedOnly: false,
    };
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
