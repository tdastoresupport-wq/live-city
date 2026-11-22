# LIVE CITY — MASTER TECHNICAL AUDIT (`MASTER_TECHNICAL_AUDIT.md`)

**Baseline Audited Commit:** `96c4d0d7e67de74a3c87f452e1cb74b13de56c35`  
**Audit Method:** Full repository static inspection, circular-dependency trace, runtime execution tests, and build/test gate verification.

---

## 1. SEVERITY CLASSIFICATION & FINDINGS

### P0 Critical Findings
1. **`npm run server` Standalone ESM Execution Failure (`package.json`, `scripts/ts-loader.mjs`)**
   - **Evidence:** Running `node --experimental-strip-types src/server/index.ts` failed with `ERR_MODULE_NOT_FOUND` on extensionless imports (`./GameServer`, `../types`) and `SyntaxError` on non-`type` interface imports (`src/core/types/adapter.ts:1`, `src/core/state/initialWorld.ts:4`).
   - **Status in Stage 1:** **FIXED.** Created `scripts/ts-loader.mjs`, converted pure interface imports across `src/core/` and `src/server/` to `import type`, and updated `package.json` `"server"` script.
2. **Remote DNS Rebinding / TOCTOU Window on `globalThis.WebSocket` (`WebSocketBridgeTransport.ts:417-476`)**
   - **Evidence:** `validateBridgeUrlAsync()` verifies DNS records fail-closed before constructing `new globalThis.WebSocket(url)`, but Node's built-in `WebSocket` resolves DNS a second time at TCP connect without IP pinning.
   - **Classification:** **PARTIALLY MITIGATED.** Mitigated for localhost/loopback bridges and explicit allowlisted bridge hosts (`LIVE_CITY_ALLOWED_BRIDGE_HOSTS`); remote multi-tenant deployments still require OS/container egress firewall controls.

### P1 High Findings
3. **`FilePersistenceAdapter` Concurrent Write Race & Backup Overwrite Risk (`src/core/adapters/FilePersistenceAdapter.ts:34-69`)**
   - **Evidence:** `save()` uses a fixed temporary filename `${safeKey}.tmp.json` without a per-key serialization mutex. Overlapping calls (auto-save every 30s + manual `/api/control/save` + shutdown save) can race on `fs.writeFile` / `fs.rename` and copy a malformed/empty file over `.backup.json`. Additionally, `load()` only falls back to `.backup.json` on `JSON.parse` failure, not when schema validation (`WorldState.isValidSnapshot`) fails.
   - **Planned Resolution:** Stage 5 (per-key FIFO save queue, unique PID/counter temp files, primary integrity check before backup copy, schema-aware backup recovery).
4. **External Payload Timestamp Skewing `RateLimiter` Cooldowns (`TikTokLiveAdapter.ts:333-425`)**
   - **Evidence:** `handleIncomingPayload` forwards external payload timestamps (within `maxReplayAgeMs = 120_000`) directly into `RawLiveComment.timestamp`, which `CommandDispatcher.processComment` feeds into `RateLimiter.checkAndRecord(userId, eventTimestamp)`. Sending backward or jittered timestamps within the 120s window can subvert per-user cooldown accuracy.
   - **Planned Resolution:** Stage 4 (stamp authoritative server reception clock `now` after anti-replay validation, and enforce monotonic cooldown tracking in `RateLimiter`).
5. **Unbounded Frame-Rate Renderer Scene Sync (`StreamStage.tsx:86-88`, `WorldState.ts:491-523`)**
   - **Evidence:** `StreamStage.tsx` invokes `renderer.sync(worldState)` unconditionally on every `requestAnimationFrame` (~60 Hz), iterating maps and re-evaluating sprites/labels even when `WorldState` has not mutated. Concurrently, `WorldState.toSnapshot()` rescans all 484 map tiles on every 10 Hz broadcast instead of maintaining a cached/invalidated discovery list, and uses `JSON.parse(JSON.stringify(...))` for voting/event cloning.
   - **Planned Resolution:** Stages 2 & 3 (`WorldState.stateVersion` gating via `renderer.syncIfNeeded(worldState)`, cached `discoveredTiles`).
6. **Non-Timing-Safe Token Check, Destructive Oversized Request Handling & Query Token Gaps (`GameServer.ts:380-498, 840-864`)**
   - **Evidence:** `providedToken !== this.operatorToken` is not constant-time (`crypto.timingSafeEqual`). `readJsonBody()` destroys sockets on `>64KB` instead of returning HTTP `413 Payload Too Large` cleanly, and swallows invalid JSON as `{}` instead of `400 Bad Request`. URL query parameters are not explicitly audited to reject `?token=` / `?operatorToken=` leakage attempts.
   - **Planned Resolution:** Stage 6.

### P2 Medium Findings
7. **Mid-Action FSM Resource Depletion & Building Completion Delay (`CitizenSystem.ts:576-597, 708-752`)**
   - **Evidence:** While moving (`moving_to_harvest` / `moving_to_build`), `CitizenSystem.update()` immediately retargets when a node depletes or building finishes. Once in `'harvesting'` or `'building'`, the citizen waits until `actionTimer <= 0` before checking target validity.
   - **Planned Resolution:** Stage 2.
8. **Community Vote Tie / Resource-Shortage Loss (`BuildingSystem.ts:241-279`)**
   - **Evidence:** If resources are insufficient at vote close, `startNewProject(winner.type)` fails silently in terms of queuing and the winning vote is never retried once viewers gather enough wood/stone.
   - **Planned Resolution:** Stage 2 (`pendingVotedProject` queue + deterministic tie-break).
9. **Missing Keyboard Focus Indicators & `prefers-reduced-motion` Support (`src/index.css`, `src/ui/components/*`)**
   - **Evidence:** Buttons/tabs lack `:focus-visible` styles and `aria-label` attributes on icon-only controls; continuous pulse/animate classes ignore `prefers-reduced-motion`.
   - **Planned Resolution:** Stage 3.
10. **Circular Type Import (`TikTokLiveAdapter.ts` ↔ `WebSocketBridgeTransport.ts`) & Unsafe Persistence Cast (`GameEngine.ts:148`)**
    - **Evidence:** `WebSocketBridgeTransport.ts` imported transport interfaces from `./TikTokLiveAdapter`, which imported `WebSocketBridgeTransport`. `GameEngine.ts:148` cast `this.persistence as LocalStoragePersistence`.
    - **Status:** Transport circularity **RESOLVED in Stage 1** by moving shared interfaces into `src/core/types/adapter.ts`. Unsafe `GameEngine.ts` cast resolved in Stage 2 via optional `loadBackup?` on `IPersistenceAdapter`.

### P3 Low & Informational Findings
11. **Unused Dependency in `package.json` (`canvas-confetti` & `@types/canvas-confetti`)**
    - **Evidence:** Zero imports of `canvas-confetti` found across `src/`. Kept out of bundle by tree-shaking; preserved in `package.json` to avoid lockfile drift per hardening rules, documented in `TECH_DEBT.md`.
12. **Relaxed ESLint Rules (`eslint.config.js:12-17`)**
    - **Evidence:** `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` are disabled in ESLint (though `noUnusedLocals` / `noUnusedParameters` remain enforced by `tsc --noEmit`).
13. **Stale Documentation Counts (`README.md:42`, `docs/UPGRADE_AUDIT.md:90`)**
    - **Evidence:** Docs still state 13/14 test files and 49/57 tests instead of current suites (17 files / 108 tests at baseline, growing across Stages 2–7).
    - **Planned Resolution:** Stage 7.
