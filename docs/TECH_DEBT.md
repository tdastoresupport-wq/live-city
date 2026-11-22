# LIVE CITY — TECHNICAL DEBT REGISTRY (`TECH_DEBT.md`)

| ID | Area | Severity | Description & File Location | Resolution Plan |
| :--- | :--- | :---: | :--- | :--- |
| **TD-01** | Module Graph | P2 | Circular import between `TikTokLiveAdapter.ts` and `WebSocketBridgeTransport.ts`, plus runtime non-`type` interface imports breaking Node `--experimental-strip-types`. | **Resolved (Stage 1)** |
| **TD-02** | CLI / DX | P0 | `npm run server` failed on extensionless TypeScript relative imports in Node ESM. | **Resolved (Stage 1)** via `scripts/ts-loader.mjs` |
| **TD-03** | Security / SSRF | P0 | `globalThis.WebSocket` re-resolves DNS internally on TCP connect after `validateBridgeUrlAsync` pre-flight (DNS rebinding TOCTOU window). | **Partially Mitigated** (`LIVE_CITY_ALLOWED_BRIDGE_HOSTS` + OS egress firewall required for remote bridges) |
| **TD-04** | Persistence | P1 | Concurrent `FilePersistenceAdapter.save()` calls share `.tmp.json` path; backup can be overwritten with malformed primary file. | **Stage 5** |
| **TD-05** | Rate Limiting | P1 | `TikTokLiveAdapter.handleIncomingPayload` passes external payload timestamp into `RateLimiter`, enabling window-skew tricks. | **Stage 4** |
| **TD-06** | Performance | P1 | `StreamStage.tsx:87` calls `renderer.sync(worldState)` every rAF frame; `WorldState.toSnapshot()` rescans all 484 tiles on every broadcast. | **Stages 2 & 3** |
| **TD-07** | HTTP Boundary | P1 | `GameServer.ts` token check not constant-time; `readJsonBody` returns `{}` on malformed JSON and omits HTTP 413 handling / query-token ban. | **Stage 6** |
| **TD-08** | Game Systems | P2 | Citizens mid-harvest/mid-build wait until timer expiry when target becomes invalid; voted winners lost if resources insufficient at close. | **Stage 2** |
| **TD-09** | Types | P2 | `GameEngine.ts:148` casts `IPersistenceAdapter as LocalStoragePersistence`; some `any` types in `WebSocketBridgeTransport` payload normalizers & tests. | **Stages 2 & 4** |
| **TD-10** | Accessibility | P2 | Missing `:focus-visible`, `aria-label` on toolbar/inspector controls, and `prefers-reduced-motion` guards. | **Stage 3** |
| **TD-11** | Dependencies | P3 | `canvas-confetti` declared in `package.json` without `src/` usage (retained intentionally to preserve clean `npm ci` lockfile unless cleanup sprint scheduled). | Deferred / Documented |
| **TD-12** | Linting / CI | P3 | `eslint.config.js` turns off `no-explicit-any`; CI lacks `npm audit` and live server smoke execution. | **Stage 7** |
