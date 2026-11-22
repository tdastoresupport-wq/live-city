# LIVE CITY — Security Architecture & Threat Mitigations

---

## 1. Local Authoritative API & Operator Authentication

Implemented in [GameServer.ts](file:///c:/Users/Zev/Desktop/live-city/src/server/GameServer.ts):

1. **Loopback Default Bind:** Server binds to `127.0.0.1` by default and rejects non-loopback remote sockets (`403`).
2. **Host & Canonical Origin Allowlist:** Both HTTP requests and WebSocket `/ws` upgrades enforce `Host` header validation and check `Origin` against exact canonicalized allowlisted origins (`127.0.0.1`/`localhost` on configured ports plus `LIVE_CITY_ALLOWED_ORIGINS`), rejecting `'cross-site'` `Sec-Fetch-Site` headers.
3. **Constant-Time Token Authentication:** Protected `POST` control endpoints verify the `x-operator-token` header against the CSPRNG/configured `operatorToken` using `crypto.timingSafeEqual` over UTF-8 byte buffers.
4. **No URL Token Leakage:** Both HTTP handlers and WebSocket `/ws` upgrades inspect query string parameters case-insensitively for `token`, `operatorToken`, or `x-operator-token` and reject matches with `400 Bad Request`.
5. **Local Session Bootstrap:** `GET /api/auth/session` blocks `Sec-Fetch-Mode: no-cors` requests (`403`) and returns the operator token only to verified loopback + Host/Origin callers.
6. **Strict JSON Body Parser & Pollution Defense:** `POST` bodies enforce a `64 KB` raw byte ceiling (`413 Payload Too Large`), require valid JSON object roots when non-empty (`400 Bad Request`), and recursively strip `__proto__`, `constructor`, and `prototype` keys before handing data to command/control handlers.
7. **Defensive Security Headers:** All HTTP responses emit:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: SAMEORIGIN`
   - `Referrer-Policy: no-referrer`
   - `Cache-Control: no-store`

---

## 2. WebSocket Bridge SSRF & Handshake Verification

Implemented in [WebSocketBridgeTransport.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/adapters/WebSocketBridgeTransport.ts) and [TikTokLiveAdapter.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/adapters/TikTokLiveAdapter.ts):

- **Scheme & Range Validation:** Permits only `ws://` and `wss://` without fragments (`#`). Blocks RFC 1918 private networks, link-local metadata (`169.254.0.0/16`), CGNAT (`100.64.0.0/10`), and IPv6 ULA/link-local addresses.
- **Fail-Closed DNS Pre-Flight (`PARTIALLY MITIGATED`):** External hosts must match `allowedHosts` (`LIVE_CITY_ALLOWED_BRIDGE_HOSTS`) and resolve solely public non-private IP records within timeout (`dnsTimeoutMs`). Because OS/socket dial occurs slightly after JS DNS pre-flight, ultra-short-TTL DNS rebinding remains `PARTIALLY MITIGATED`; deployers should rely on loopback bridges or explicitly pinned `allowedHosts`.
- **Strict ACK Verification (`requireAck`):** Requires explicit positive subscription acknowledgment carrying a matching normalized channel identifier (`channelId`/`channel`/`uniqueId`). Retains `requireAck` state across reconnects.
- **Anti-Replay & Clock Integrity:** Rejects events outside `maxReplayAgeMs` (`120_000` ms default), deduplicates via bounded LRU `Deduplicator`, and stamps emitted events with the adapter's authoritative local receive clock (`timestamp: now`) so untrusted near-future payload timestamps cannot bias `RateLimiter` cooldowns.

---

## 3. Command Input & Persistence Integrity

- Viewer comments/usernames pass length caps (`80` / `36` chars) and control-character sanitization in `CommandParser.sanitizeText`.
- `RateLimiter` enforces monotonic per-user cooldowns and bounded global requests/sec with automatic LRU eviction.
- `FilePersistenceAdapter` serializes writes per key, uses unique PID/counter temp files, validates existing JSON before overwriting `.backup.json`, and cleans temp artifacts on errors.
