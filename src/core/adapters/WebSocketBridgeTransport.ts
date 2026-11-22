import {
  ExternalStreamPayload,
  ILiveBridgeTransport,
  BridgeTransportConnectOptions,
} from './TikTokLiveAdapter';

export interface ValidateBridgeUrlOptions {
  allowLoopback?: boolean;
  allowedHosts?: string[];
  dnsTimeoutMs?: number;
}

export interface DnsLookupResult {
  ok: boolean;
  addresses: string[];
  error?: string;
  timedOut?: boolean;
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

/**
 * Expands any valid IPv6 literal (including compressed '::' and IPv4-embedded suffixes)
 * into its 8 canonical 16-bit integer groups. Returns null if malformed.
 */
export function expandIpv6ToGroups(raw: string): number[] | null {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }
  if (!ip || !ip.includes(':') || ip.includes('%')) {
    return null;
  }

  // Handle embedded IPv4 suffix (e.g. ::ffff:169.254.169.254 or 64:ff9b::10.0.0.1)
  const lastColon = ip.lastIndexOf(':');
  const tail = ip.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!isIpv4(tail)) return null;
    const octets = tail.split('.').map(Number);
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const doubleColonParts = ip.split('::');
  if (doubleColonParts.length > 2) {
    return null;
  }

  let groupStrings: string[];
  if (doubleColonParts.length === 2) {
    const left = doubleColonParts[0] ? doubleColonParts[0].split(':') : [];
    const right = doubleColonParts[1] ? doubleColonParts[1].split(':') : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    groupStrings = [...left, ...Array<string>(missing).fill('0'), ...right];
  } else {
    groupStrings = ip.split(':');
    if (groupStrings.length !== 8) return null;
  }

  const groups: number[] = [];
  for (const part of groupStrings) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    groups.push(parseInt(part, 16));
  }
  return groups;
}

export function isIpv6(host: string): boolean {
  return expandIpv6ToGroups(host) !== null;
}

export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return true;
  const groups = expandIpv6ToGroups(h);
  if (groups) {
    // Only explicit IPv6 loopback ::1 (reject IPv4-mapped ::ffff:127.0.0.1 bypasses)
    const isV6Loopback =
      groups[0] === 0 &&
      groups[1] === 0 &&
      groups[2] === 0 &&
      groups[3] === 0 &&
      groups[4] === 0 &&
      groups[5] === 0 &&
      groups[6] === 0 &&
      groups[7] === 1;
    if (isV6Loopback) return true;
  }
  return false;
}

export function isForbiddenPrivateOrMetadataIpv4(ip: string): boolean {
  if (!isIpv4(ip)) return true;
  const parts = ip.split('.').map(Number);
  const [a, b, c] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmarking)
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224) return true; // 224.0.0.0/4 (multicast & reserved)
  return false;
}

export function isForbiddenPrivateOrMetadataIpv6(raw: string): boolean {
  const groups = expandIpv6ToGroups(raw);
  if (!groups) return true; // Fail closed on malformed IPv6

  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;

  const toEmbeddedIpv4 = (hi: number, lo: number): string =>
    `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;

  // Unspecified :: and loopback ::1
  const allZeroPrefix6 = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0;
  if (allZeroPrefix6 && g6 === 0 && (g7 === 0 || g7 === 1)) return true;

  // Deprecated IPv4-compatible ::/96 (e.g. ::127.0.0.1, ::169.254.169.254)
  if (allZeroPrefix6) {
    return isForbiddenPrivateOrMetadataIpv4(toEmbeddedIpv4(g6, g7));
  }

  // IPv4-mapped ::ffff:0:0/96 (e.g. ::ffff:169.254.169.254, ::ffff:a9fe:a9fe, ::ffff:127.0.0.1)
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return isForbiddenPrivateOrMetadataIpv4(toEmbeddedIpv4(g6, g7));
  }

  // IPv4-translated ::ffff:0:0:0/96
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) {
    return isForbiddenPrivateOrMetadataIpv4(toEmbeddedIpv4(g6, g7));
  }

  // NAT64 local prefix 64:ff9b:1::/48
  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 0x0001) return true;

  // NAT64 well-known prefix 64:ff9b::/96
  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isForbiddenPrivateOrMetadataIpv4(toEmbeddedIpv4(g6, g7));
  }

  // 6to4 tunneling 2002::/16 (embeds IPv4 in g1:g2)
  if (g0 === 0x2002) {
    return isForbiddenPrivateOrMetadataIpv4(toEmbeddedIpv4(g1, g2));
  }

  // Link-local fe80::/10 and deprecated site-local fec0::/10
  if ((g0 & 0xffc0) === 0xfe80) return true;
  if ((g0 & 0xffc0) === 0xfec0) return true;

  // Unique local fc00::/7
  if ((g0 & 0xfe00) === 0xfc00) return true;

  // Multicast ff00::/8
  if ((g0 & 0xff00) === 0xff00) return true;

  // Discard-only 100::/64
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true;

  // Documentation 2001:db8::/32, Teredo 2001:0::/32, Benchmarking 2001:2::/48
  if (g0 === 0x2001 && (g1 === 0x0db8 || g1 === 0x0000 || (g1 === 0x0002 && g2 === 0))) {
    return true;
  }

  return false;
}

/**
 * Canonicalizes an allowlist host entry (domain, IPv4, or IPv6) to match URL.hostname format.
 */
export function canonicalizeAllowedHost(entry: string): string {
  const trimmed = String(entry || '').trim().toLowerCase();
  if (!trimmed || trimmed.includes('://') || trimmed.includes('/') || trimmed.includes('*')) {
    return '';
  }
  const candidate =
    trimmed.includes(':') && !trimmed.startsWith('[') ? `[${trimmed}]` : trimmed;
  try {
    const parsed = new URL(`ws://${candidate}`);
    if (parsed.port || parsed.username || parsed.password) {
      return '';
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Normalizes a channel identifier for strict subscription ACK matching.
 * Strips at most one leading '@' after trimming. Rejects empty, '@@', or malformed tokens.
 */
export function normalizeChannelId(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (!withoutAt || withoutAt.startsWith('@') || /[\s/?#@]/.test(withoutAt)) {
    return '';
  }
  return withoutAt.toLowerCase();
}

/**
 * Resolves DNS hostname in Node environment with an explicit timeout.
 * Fails closed: distinguishes lookup success, empty results, timeout, and errors.
 */
export async function resolveDnsHostnames(
  hostname: string,
  timeoutMs = 3000
): Promise<DnsLookupResult> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return {
      ok: false,
      addresses: [],
      error: `DNS verification is unavailable in current runtime for remote host "${hostname}".`,
    };
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const dns = await import('node:dns');
    const lookupPromise = dns.promises.lookup(hostname, { all: true });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`DNS lookup timed out after ${timeoutMs}ms`);
        (err as { code?: string }).code = 'ETIMEDOUT';
        reject(err);
      }, timeoutMs);
    });

    const records = await Promise.race([lookupPromise, timeoutPromise]);
    if (!Array.isArray(records) || records.length === 0) {
      return {
        ok: false,
        addresses: [],
        error: `DNS lookup returned no address records for "${hostname}".`,
      };
    }

    const addresses = records
      .map((r) => (r && typeof r.address === 'string' ? r.address.trim() : ''))
      .filter((a) => a.length > 0);

    if (addresses.length === 0) {
      return {
        ok: false,
        addresses: [],
        error: `DNS lookup returned empty addresses for "${hostname}".`,
      };
    }

    return { ok: true, addresses };
  } catch (err) {
    const isTimeout =
      err instanceof Error && ((err as { code?: string }).code === 'ETIMEDOUT' || err.message.includes('timed out'));
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      addresses: [],
      timedOut: isTimeout,
      error: `DNS lookup failed for "${hostname}": ${reason}`,
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Synchronous URL, scheme, IP range, and host allowlist validator.
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

  // Local loopback policy (preserves standard local bridge 127.0.0.1 / localhost / [::1])
  if (isLoopbackHost(hostname)) {
    if (options?.allowLoopback === false) {
      return { valid: false, error: 'Loopback bridge address is not permitted by policy.' };
    }
    return { valid: true, normalized: parsed.toString() };
  }

  // Non-loopback targets: classify raw IPv4, raw IPv6, or domain name
  if (isIpv4(hostname)) {
    if (isForbiddenPrivateOrMetadataIpv4(hostname)) {
      return {
        valid: false,
        error: 'Target IP address is in a private, link-local, or metadata address range.',
      };
    }
  } else if (hostname.startsWith('[') || hostname.includes(':')) {
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
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.lan') ||
      hostname.endsWith('.home.arpa')
    ) {
      return {
        valid: false,
        error: 'Internal domain names are blocked for security reasons.',
      };
    }
  }

  // Remote host allowlist check applies to ALL non-loopback targets (domains AND IP literals)
  if (options?.allowedHosts && options.allowedHosts.length > 0) {
    const allowedSet = new Set(
      options.allowedHosts.map(canonicalizeAllowedHost).filter((h) => h.length > 0)
    );
    if (!allowedSet.has(hostname)) {
      return {
        valid: false,
        error: `Target host "${hostname}" is not in allowed bridge hosts list.`,
      };
    }
  }

  return { valid: true, normalized: parsed.toString() };
}

/**
 * Asynchronous fail-closed validator with DNS pre-flight check.
 *
 * SECURITY LIMITATION NOTE:
 * Because Node's built-in globalThis.WebSocket resolves the hostname internally upon TCP connect,
 * DNS pre-flight alone cannot fully eliminate DNS rebinding/TOCTOU windows for untrusted domains.
 * Use allowedBridgeHosts (LIVE_CITY_ALLOWED_BRIDGE_HOSTS) and OS/container egress firewall rules
 * as defense-in-depth for remote bridge deployments.
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

  let parsed: URL;
  try {
    parsed = new URL(syncResult.normalized);
  } catch {
    return { valid: false, error: `Invalid bridge URL format: "${urlStr}".` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Local loopback is already verified by policy; raw IPv4/IPv6 literals do not require DNS lookup
  if (isLoopbackHost(hostname) || isIpv4(hostname) || hostname.startsWith('[') || hostname.includes(':')) {
    return syncResult;
  }

  // Fail-closed DNS pre-flight lookup for remote hostnames
  const dnsResult = await resolveDnsHostnames(hostname, options?.dnsTimeoutMs ?? 3000);
  if (!dnsResult.ok || dnsResult.addresses.length === 0) {
    return {
      valid: false,
      error: dnsResult.error || `Unable to resolve bridge hostname "${hostname}".`,
    };
  }

  for (const addr of dnsResult.addresses) {
    if (isIpv4(addr)) {
      if (isForbiddenPrivateOrMetadataIpv4(addr)) {
        return {
          valid: false,
          error: `Target domain "${hostname}" resolves to forbidden IPv4 address: ${addr}`,
        };
      }
    } else if (isIpv6(addr)) {
      if (isForbiddenPrivateOrMetadataIpv6(addr)) {
        return {
          valid: false,
          error: `Target domain "${hostname}" resolves to forbidden IPv6 address: ${addr}`,
        };
      }
    } else {
      return {
        valid: false,
        error: `Target domain "${hostname}" resolved to unrecognized IP address: ${addr}`,
      };
    }
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

    // 3. Validate bridge URL (fail-closed async DNS pre-flight + IP/allowlist checks)
    const validation = await validateBridgeUrlAsync(bridgeUrl, {
      allowLoopback: options?.allowLoopback ?? true,
      allowedHosts: options?.allowedHosts,
      dnsTimeoutMs: options?.dnsTimeoutMs,
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
      let resolvedSuccessfully = false;
      let connectTimer: ReturnType<typeof setTimeout> | null = null;
      let ackTimer: ReturnType<typeof setTimeout> | null = null;
      let activeSocket: WebSocket | null = null;

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

      const detachAndCloseFailedSocket = () => {
        if (activeSocket) {
          const s = activeSocket;
          activeSocket = null;
          if (this.ws === s) {
            this.ws = null;
          }
          try {
            s.onopen = null;
            s.onmessage = null;
            s.onerror = null;
            s.onclose = null;
            s.close();
          } catch {
            // ignore
          }
        }
        this.isConnected = false;
        this.isSubscribed = false;
      };

      const safeResolve = () => {
        if (!settled && this.connectionGen === currentGen) {
          settled = true;
          resolvedSuccessfully = true;
          clearAllTimers();
          resolve();
        }
      };

      const safeReject = (err: Error) => {
        if (!settled && this.connectionGen === currentGen) {
          settled = true;
          clearAllTimers();
          detachAndCloseFailedSocket();
          reject(err);
        }
      };

      try {
        const socket = new globalThis.WebSocket(this.activeBridgeUrl);
        activeSocket = socket;
        this.ws = socket;

        // Overall connect timeout
        connectTimer = setTimeout(() => {
          if (!settled && this.connectionGen === currentGen) {
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
            // Strict mode: require explicit positive subscription ACK matching channelId
            ackTimer = setTimeout(() => {
              if (!settled && this.connectionGen === currentGen) {
                safeReject(
                  new Error('Bridge handshake acknowledgement timed out: subscribe unverified')
                );
              }
            }, ackTimeoutMs);
          } else {
            // Non-strict mode: give 300ms window for immediate ACK or error frame, else resolve unverified
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
            const ctrl = this.evaluateControlFrame(parsed, requireAck);
            if (ctrl.isControl) {
              if (ctrl.isError) {
                const errMsg = ctrl.errorReason || 'Bridge returned error response';
                if (!settled) {
                  safeReject(new Error(errMsg));
                }
                return;
              }
              if (ctrl.isPositiveAck) {
                this.isSubscribed = true;
                safeResolve();
                return;
              }
              if (ctrl.isSocketConnectedOnly) {
                this.isConnected = true;
                if (!requireAck && !settled) {
                  if (ackTimer) {
                    clearTimeout(ackTimer);
                  }
                  ackTimer = setTimeout(() => {
                    safeResolve();
                  }, 100);
                }
                return;
              }
              // Non-verifying control frame (e.g. generic ok/success or non-strict ACK missing channel)
              return;
            }

            // 2. Normal stream payload (comment / gift / like)
            const normalized = this.normalizePayload(parsed);
            if (normalized) {
              // In strict mode, normal stream payloads NEVER substitute for positive subscription ACK
              if (requireAck && !this.isSubscribed) {
                return;
              }

              if (!settled) {
                safeResolve();
              }

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
          } else if (resolvedSuccessfully && !this.isManualDisconnect) {
            // Emit unexpected disconnect ONLY for previously established connections
            const reason = event.reason || `Bridge disconnected (code ${event.code})`;
            for (const cb of this.closeCallbacks) {
              cb(reason);
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

  private evaluateControlFrame(
    parsed: any,
    requireAck: boolean
  ): {
    isControl: boolean;
    isError: boolean;
    isPositiveAck: boolean;
    isSocketConnectedOnly: boolean;
    errorReason?: string;
  } {
    if (!parsed || typeof parsed !== 'object') {
      return {
        isControl: false,
        isError: false,
        isPositiveAck: false,
        isSocketConnectedOnly: false,
      };
    }

    const statusLower = typeof parsed.status === 'string' ? parsed.status.trim().toLowerCase() : '';

    // A. Check for error frames or error status
    const isError =
      statusLower === 'error' ||
      parsed.event === 'error' ||
      parsed.type === 'error' ||
      parsed.ok === false ||
      (parsed.action === 'ack' && statusLower === 'error') ||
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

    // B. Strict positive subscription ACK schema check
    const isAckCandidate =
      (parsed.action === 'ack' && statusLower === 'subscribed') ||
      (parsed.type === 'ack' && statusLower === 'subscribed') ||
      parsed.action === 'subscribed' ||
      parsed.event === 'subscribed' ||
      parsed.type === 'subscribed' ||
      statusLower === 'subscribed';

    if (isAckCandidate) {
      const channelInFrame =
        parsed.channelId ??
        parsed.channel ??
        parsed.uniqueId ??
        parsed.data?.channelId ??
        parsed.data?.uniqueId ??
        parsed.data?.channel;

      const expectedNorm = normalizeChannelId(this.activeChannelId);
      const hasRawChannel = channelInFrame !== undefined && channelInFrame !== null;
      const receivedNorm = normalizeChannelId(channelInFrame);

      // Missing or malformed channel identifier must NEVER become positive ACK
      if (!hasRawChannel || !receivedNorm) {
        const isExplicitlyMalformed = hasRawChannel && String(channelInFrame).trim().length > 0;
        if (requireAck || isExplicitlyMalformed) {
          return {
            isControl: true,
            isError: true,
            isPositiveAck: false,
            isSocketConnectedOnly: false,
            errorReason: hasRawChannel
              ? `Subscription ACK contains invalid channel identifier: "${String(channelInFrame)}"`
              : 'Subscription ACK missing required channel identifier',
          };
        }
        return {
          isControl: true,
          isError: false,
          isPositiveAck: false,
          isSocketConnectedOnly: false,
        };
      }

      // Channel must match active channel strictly after normalization
      if (!expectedNorm || receivedNorm !== expectedNorm) {
        return {
          isControl: true,
          isError: true,
          isPositiveAck: false,
          isSocketConnectedOnly: false,
          errorReason: `Subscription ACK channel mismatch: expected "${this.activeChannelId}", got "${String(channelInFrame)}"`,
        };
      }

      return {
        isControl: true,
        isError: false,
        isPositiveAck: true,
        isSocketConnectedOnly: false,
      };
    }

    // C. Generic connected frames (transport level only — never verifies subscription)
    const isGenericConnected =
      parsed.type === 'connected' ||
      parsed.event === 'connected' ||
      (statusLower === 'connected' && parsed.action !== 'ack');

    if (isGenericConnected) {
      return {
        isControl: true,
        isError: false,
        isPositiveAck: false,
        isSocketConnectedOnly: true,
      };
    }

    // D. Generic ok/success/bare ack frames (do not mark subscription verified)
    const isGenericNonVerifyingAck =
      parsed.action === 'ack' ||
      parsed.type === 'ack' ||
      statusLower === 'ok' ||
      statusLower === 'success';

    if (isGenericNonVerifyingAck) {
      return {
        isControl: true,
        isError: false,
        isPositiveAck: false,
        isSocketConnectedOnly: false,
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
