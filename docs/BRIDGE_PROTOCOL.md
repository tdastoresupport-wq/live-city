# LIVE CITY — TikTok / External Bridge WebSocket Protocol Specification

## 1. Status & Verification Boundary

- **Real External TikTok Stream:** `BLOCKED` in automated CI/offline environments because live TikTok Webcast rooms, stream keys, and third-party TikTok scraping/relay bridges (e.g. `tiktok-live-connector` or local bridge daemon) require an active external livestream and network access.
- **Protocol Contract & Adapter Hardening:** `LOCAL SERVER INTEGRATION TESTED` & `UNIT TESTED` against a local RFC 6455 WebSocket bridge server and redacted wire fixtures in [bridge-protocol-conformance.test.ts](file:///c:/Users/Zev/Desktop/live-city/src/test/bridge-protocol-conformance.test.ts).

---

## 2. Transport & Security Pre-Flight

Implemented in [WebSocketBridgeTransport.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/adapters/WebSocketBridgeTransport.ts):

1. Only `ws://` and `wss://` schemes are accepted; URI fragments (`#`) are rejected per RFC 6455.
2. When `allowLoopback: true` (default for local bridges), loopback literals (`127.0.0.1`, `::1`, `localhost`) are permitted without external allowlist entries.
3. Private LAN / link-local / CGNAT / metadata ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10`, `fc00::/7`, `fe80::/10`, etc.) are blocked.
4. Non-loopback hostnames must match `allowedHosts` AND pass fail-closed `dns.promises.lookup(..., { all: true })` resolution before opening a WebSocket (`PARTIALLY MITIGATED` against DNS rebinding due to TOCTOU between Node pre-flight `dns.lookup` and Chromium/Undici WebSocket connect).

---

## 3. Handshake & Strict Subscription ACK Contract

### Outbound Subscribe Frame (Client -> Bridge)

Sent immediately upon `socket.onopen` when `channelId` is provided:

```json
{
  "action": "subscribe",
  "platform": "tiktok",
  "channelId": "@redacted_creator"
}
```

### Positive Subscription ACK Frame (Bridge -> Client)

To transition `connectionState.subscriptionVerified = true`, the bridge MUST emit a control frame satisfying both rules:

1. Subscription ACK indicator matches one of:
   - `action === "ack"` and `status === "subscribed"`
   - `type === "ack"` and `status === "subscribed"`
   - `action === "subscribed"` / `event === "subscribed"` / `type === "subscribed"` / `status === "subscribed"`
2. Channel identifier (`channelId`, `channel`, `uniqueId`, or nested `data.channelId` / `data.channel` / `data.uniqueId`) normalizes (`normalizeChannelId`: strip single leading `@`, lowercase, reject whitespace/slashes/`?`/`#`/`@@`) to match the active requested `channelId`.

Example accepted ACK:

```json
{
  "action": "ack",
  "status": "subscribed",
  "channelId": "redacted_creator"
}
```

Rejected/unverified control frames in `requireAck: true` mode:
- Generic `{"type":"connected"}`, `{"status":"ok"}`, or `{"action":"ack"}` without `status: "subscribed"` never verify the subscription.
- ACK frames missing a channel identifier are rejected in strict mode.
- ACK frames whose normalized channel differs from the active channel are rejected with `channel mismatch`.

### Error Frame (Bridge -> Client)

Any frame containing `status: "error"`, `event: "error"`, `type: "error"`, `ok: false`, or string `error` fails the pending handshake (or surfaces an adapter error on active streams):

```json
{
  "status": "error",
  "message": "Channel offline or rate-limited by upstream bridge"
}
```

---

## 4. Supported Event Wire Conventions (Redacted Fixtures)

### Convention A — Direct Normalized Payload (`raw.type`)

**Comment (`comment`):**
```json
{
  "type": "comment",
  "eventId": "msg_redacted_001",
  "userId": "usr_redacted_101",
  "uniqueId": "viewer_alpha",
  "nickname": "Viewer Alpha",
  "comment": "xay",
  "timestamp": 1760000000
}
```

**Gift (`gift`):**
```json
{
  "type": "gift",
  "eventId": "gift_redacted_002",
  "userId": "usr_redacted_102",
  "uniqueId": "donor_beta",
  "nickname": "Donor Beta",
  "giftName": "Rose",
  "repeatCount": 3,
  "diamondCount": 3,
  "timestamp": 1760000001000
}
```

**Like (`like`):**
```json
{
  "type": "like",
  "eventId": "like_redacted_003",
  "userId": "usr_redacted_103",
  "uniqueId": "fan_gamma",
  "nickname": "Fan Gamma",
  "likeCount": 15,
  "totalLikeCount": 1250,
  "timestamp": 1760000002000
}
```

### Convention B — Event Wrapper (`raw.event` + `raw.data`)

Supported `event` values: `"chat"`, `"comment"`, `"gift"`, `"like"`.

```json
{
  "event": "chat",
  "data": {
    "msgId": "msg_redacted_004",
    "secUid": "sec_redacted_201",
    "uniqueId": "viewer_delta",
    "nickname": "Viewer Delta",
    "comment": "!go",
    "createTime": 1760000003
  }
}
```

---

## 5. Timestamp Validation, Anti-Replay & Rate-Limit Protection

Implemented in [TikTokLiveAdapter.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/adapters/TikTokLiveAdapter.ts) and [RateLimiter.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/commands/RateLimiter.ts):

1. Unix timestamps below `1e11` are treated as seconds and multiplied by `1000` into milliseconds.
2. Events outside `Math.abs(now - eventTs) <= maxReplayAgeMs` (default `120_000` ms) are rejected as stale replays or invalid future events.
3. Unique `eventId` values are enforced through `Deduplicator` so duplicate webhook/socket deliveries are dropped.
4. Once anti-replay passes, `TikTokLiveAdapter.handleIncomingPayload` stamps every normalized `RawLiveComment`, `RawLiveGift`, and `RawLiveLike` with the authoritative server receive clock (`timestamp: now`) rather than forwarding untrusted payload `eventTs`.
5. `RateLimiter.recordOrAllow` maintains monotonic user timestamps (`Math.max(now, lastTime)`) so skewed or future payload timestamps cannot lock out or speed up viewer cooldown windows.
