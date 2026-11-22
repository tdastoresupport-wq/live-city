# LIVE CITY — System Architecture

---

## 1. Layered Module Separation

```text
+-----------------------------------------------------------------------+
|                       UI & OBS STAGE LAYER (src/ui)                   |
|  - Operator Dashboard (/): CommentSimulator, CityInspector, Toolbar   |
|  - OBS Stage (/stage): strictly read-only WebSocket observer          |
|  - GameRuntimeClient: REST/WS sync + local browser dev fallback       |
+----------------------------------+------------------------------------+
                                   | HTTP REST + RFC 6455 WS (/ws)
+----------------------------------v------------------------------------+
|                  AUTHORITATIVE SERVER LAYER (src/server)              |
|  - GameServer: loopback bind, Host/Origin allowlist, timingSafeEqual  |
|  - token auth, 64KB body cap, __proto__ strip, /api/auth/session      |
|  - wsProtocol: zero-dependency RFC 6455 upgrade & heartbeat           |
+----------------------------------+------------------------------------+
                                   | Headless calls (25 Hz tick)
+----------------------------------v------------------------------------+
|                    HEADLESS GAME CORE (src/core)                      |
|  - GameEngine & WorldState (stateVersion, Snapshot v2, milestones)    |
|  - Systems: CitizenSystem (FSM/XP/cancelTask), BuildingSystem         |
|    (voting queue/tie-break), ResourceSystem, AudioSystem              |
|  - Commands: CommandParser, Deduplicator, RateLimiter, Dispatcher     |
|  - Adapters: MockLiveAdapter, TikTokLiveAdapter,                      |
|    WebSocketBridgeTransport, FilePersistenceAdapter, LocalStorage     |
+----------------------------------+------------------------------------+
                                   | Version-gated sync (stateVersion)
+----------------------------------v------------------------------------+
|                   PIXIJS 8 RENDERER LAYER (src/renderer)              |
|  - PixiWorldRenderer: syncIfNeeded(), reducedMotion, idle sort skip   |
|  - IsometricGrid, ResourceRenderer, StructureRenderer, EntityRenderer |
|  - CameraController: pan, zoom, recenter                              |
+-----------------------------------------------------------------------+
```

---

## 2. Runtime Node ESM Execution

Backend scripts (`npm run server`, `npm run test:smoke`, `npm run test:load`) run directly on Node.js (`--experimental-strip-types`) via `scripts/ts-loader.mjs`, which resolves extensionless relative `.ts` and `/index.ts` imports without corrupting Vite's `"moduleResolution": "bundler"` configuration. Pure type/interface imports across `src/core/` and `src/server/` enforce `import type`, eliminating circular dependency issues (`src/core/types/adapter.ts`).

---

## 3. Authority & OBS Split-Brain Prevention

- When the local authoritative `GameServer` (`127.0.0.1:4000` by default) is reachable, both Operator Dashboard (`/`) and OBS Stage (`/stage`) synchronize against server snapshots (`type: 'snapshot'` on connect, `'state_sync'` at up to 10 Hz during motion or immediately on command/state changes).
- OBS Stage (`/stage`) NEVER runs a local fallback simulation engine if the WebSocket disconnects, eliminating divergence between broadcaster preview and stream output.
