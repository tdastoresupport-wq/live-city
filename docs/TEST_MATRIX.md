# LIVE CITY — Verification & Test Matrix

**Verified Test Suite Scope:** `22` Vitest files, `123` passing tests + standalone `test:smoke` + `test:load` + production Vite preview Chromium inspection.

---

## 1. Automated Test Suite Breakdown (`npm test`)

| Category | Test File | Scope & Verified Invariants | Evidence Tier |
|---|---|---|---|
| **Command Parsing & Anti-Spam** | `command-parser.test.ts` | Bilingual VN/EN aliases, Unicode stripping, prompt length bounds | `UNIT TESTED` |
| | `deduplication.test.ts` | Bounded LRU duplicate `eventId` rejection | `UNIT TESTED` |
| | `rate-limiter.test.ts` | Per-user cooldown, global burst cap, monotonic timestamp hardening | `UNIT TESTED` |
| **Core Simulation & Economy** | `citizen.test.ts` | Citizen spawn, join deduplication, resting cap | `UNIT TESTED` |
| | `harvesting.test.ts` | Harvest -> carry -> deposit -> storage increment lifecycle | `UNIT TESTED` |
| | `building.test.ts` | Blueprint placement, atomic resource spend, construction progress | `UNIT TESTED` |
| | `resources.test.ts` | Passive farm/market yield, node regeneration, trade | `UNIT TESTED` |
| | `multi-user.test.ts` | Concurrent multi-viewer command orchestration | `UNIT TESTED` |
| | `p2-deep-gameplay.test.ts` | Voting session, city events, multi-building progression | `UNIT TESTED` |
| | `engine-invariants-and-economy.test.ts` | Progression (`xp`/`level`/`title`), `cancelTask` cargo preservation, mid-action harvest/build recovery, perimeter path fallback, `removeCitizen`, tie-break voting & `pendingVotedProject`, Snapshot v2, 5m/15m/30m/60m deterministic simulations | `UNIT TESTED` |
| **Persistence & Recovery** | `persistence.test.ts` | Snapshot export/import parity | `UNIT TESTED` |
| | `persistence-crash-recovery.test.ts` | FIFO save queue serialization, clean temp cleanup, valid-only backup rotation, schema-invalid/corrupt primary -> backup recovery in `os.tmpdir()` | `UNIT TESTED` |
| **Performance** | `performance-load.test.ts` | 60 active citizens x 200 ticks (`p95 < 25ms`, `max < 100ms`), 60-citizen snapshot serialization budget | `UNIT TESTED` |
| **Bridge & Security** | `p3-live-adapter.test.ts` | `TikTokLiveAdapter` normalization, replay window, error isolation | `MOCK INTEGRATION TESTED` |
| | `bridge-reliability.test.ts` | Reconnect lifecycle, exponential backoff, manual disconnect flag reset, listener cleanup | `LOCAL SERVER INTEGRATION TESTED` |
| | `security-and-ack-hardening.test.ts` | Local operator session, CORS/Origin checks, SSRF private IP blocks, strict ACK contract | `LOCAL SERVER INTEGRATION TESTED` |
| | `security-regression-patch.test.ts` | Missing-channel ACK rejection, persistent `requireAck` across reconnect, fail-closed DNS, `/ws` OBS Stage read-only isolation | `LOCAL SERVER INTEGRATION TESTED` |
| | `bridge-protocol-conformance.test.ts` | Subscribe handshake, strict ACK, Convention A & B wire fixtures, server receive clock clamping vs future payload timestamps | `LOCAL SERVER INTEGRATION TESTED` |
| **Authoritative Server & E2E** | `p0-foundation-fixes.test.ts` | Foundation fixes, pathfinding, storage bounds | `UNIT TESTED` |
| | `p1-server-and-sync.test.ts` | `GameServer` HTTP/WS sync & engine lifecycle | `LOCAL SERVER INTEGRATION TESTED` |
| | `release-hardening.test.ts` | Authoritative server sync, OBS Stage non-fallback split-brain prevention | `LOCAL SERVER INTEGRATION TESTED` |
| | `e2e-full-lifecycle.test.ts` | `crypto.timingSafeEqual` auth, query-token `400` rejection, `403` Origin block, `413` >64KB body, `400` malformed/array JSON, `__proto__` stripping, security headers, HTTP -> WS `state_sync` -> shutdown -> disk reboot recovery | `LOCAL SERVER INTEGRATION TESTED` |

---

## 2. Standalone Verification Scripts & Browser Checks

| Check | Command / Mechanism | Result | Evidence Tier |
|---|---|---|---|
| **TypeScript Compiler** | `npm run typecheck` (`tsc --noEmit`) | `0` errors | `UNIT TESTED` |
| **ESLint Check** | `npm run lint` (`eslint . --max-warnings 0`) | `0` warnings/errors | `UNIT TESTED` |
| **Production Build** | `npm run build` (`tsc && vite build`) | Built `dist/` in ~0.55s | `UNIT TESTED` |
| **Node Server Smoke** | `npm run test:smoke` (`scripts/run-smoke-test.ts`) | Real `GameServer` HTTP/WS + negative auth checks passed | `LOCAL SERVER INTEGRATION TESTED` |
| **Engine Load Suite** | `npm run test:load` (`scripts/run-load-test.ts`) | 60 active citizens, 500 ticks, `p95TickMs` ~0.10–0.12ms | `UNIT TESTED` |
| **Browser Preview** | Vite Preview (`http://127.0.0.1:4173/`) via headless Chromium (`/` and `/stage`) | Canvas, HUD, simulator `VÀO`/`GỖ`, `Lv.1 • Tân Binh` badge, `/stage` isolation verified, 0 console/network errors | `BROWSER E2E TESTED` |
| **Real TikTok Live** | Live external TikTok room + external bridge relay | Not tested (no external live bridge/credentials in repo/CI) | `BLOCKED` |
