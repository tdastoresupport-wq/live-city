# LIVE CITY — Hardening & Upgrade Audit Trail

This document tracks major hardening milestones from Prototype -> Release Candidate on `main`.

---

## Completed Hardening Phases

1. **Package Lock & Clean CI Alignment:** Resolved `package.json` / `package-lock.json` mismatch so `npm ci` reproduces deterministically without null edge crashes.
2. **Bridge Reconnect & Dynamic URL Fixes:** Fixed `isManualDisconnect` reset ordering, generation tokens preventing stale socket listener leaks, and dynamic URL reconnection in `WebSocketBridgeTransport`.
3. **Post-Bridge Security & Strict ACK:** Locked `/api/auth/session` behind loopback/Host/Origin allowlists, added SSRF/private-IP blocking + fail-closed DNS pre-flight, and enforced channel-matched positive ACKs persisted across reconnects.
4. **Stage 1 — Forensics & Node ESM Execution:** Added `scripts/ts-loader.mjs` fixing `npm run server`, broke circular imports via `src/core/types/adapter.ts`, converted pure interfaces to `import type`, and published Phase 00 audit docs (`PROJECT_STATUS.md`, `MASTER_TECHNICAL_AUDIT.md`, `TECH_DEBT.md`, `FEATURE_TRACEABILITY.md`).
5. **Stage 2 — Engine Invariants, Progression & Economy:** Added `xp`/`level`/`title`, `CityMilestone` awards, `cancelTask()` cargo preservation, perimeter build pathing, mid-action harvest/build recovery, `removeCitizen()` cleanup, deterministic tie-breaking + `pendingVotedProject` queue, and 5m–60m deterministic simulations (`engine-invariants-and-economy.test.ts`).
6. **Stage 3 — Renderer Optimization & UI Accessibility:** Gated `StreamStage` Pixi sync on monotonic `worldState.getStateVersion()` (`syncIfNeeded`), skipped idle `sortChildren()`, cached `lastFloatColor` and `lastLevel`, added `prefers-reduced-motion` + `:focus-visible`, and surfaced milestones/levels/ARIA labels across UI components.
7. **Stage 4 — Protocol Conformance & Clock Hardening:** Stamped authoritative local receive timestamps in `TikTokLiveAdapter`, enforced monotonic `RateLimiter` cooldowns, documented `docs/BRIDGE_PROTOCOL.md`, and verified redacted Convention A/B wire fixtures (`bridge-protocol-conformance.test.ts`).
8. **Stage 5 — Atomic Persistence & Load Benchmarks:** Serialized per-key saves on FIFO queues, validated primary JSON/schema prior to `.backup.json` rotation, added Windows rename retries, and verified crash recovery (`persistence-crash-recovery.test.ts`) plus 60-citizen load benchmarks (`performance-load.test.ts`, `scripts/run-load-test.ts`, `docs/PERFORMANCE_REPORT.md`).
9. **Stage 6 — Server Security, E2E Suite & Browser Check:** Switched operator token checks to `crypto.timingSafeEqual`, rejected URL query tokens (`400`), enforced `64 KB` JSON limit (`413`), malformed/array JSON rejection (`400`), recursive prototype-key stripping, and defensive security headers; added `e2e-full-lifecycle.test.ts`, `scripts/run-smoke-test.ts`, and verified built Vite Preview in headless Chromium.
10. **Stage 7 — CI/CD & Release Documentation:** Updated `.github/workflows/ci.yml` with `test:smoke` + `test:load`, refreshed `.env.example`, `TEST_MATRIX.md`, `RELEASE_READINESS.md`, `SECURITY.md`, and operational docs.
