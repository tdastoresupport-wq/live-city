# LIVE CITY — Project Status

**Repository:** `https://github.com/tdastoresupport-wq/live-city` (`main`)  
**Release State:** Release Candidate (`0.2.0`) — Hardened, Benchmarked & Verified

---

## 1. Subsystem Readiness Summary

| Subsystem | Verification Status | Notes |
|---|---|---|
| Core Game Engine & FSM (`src/core`) | `UNIT TESTED` | Invariants, cargo preservation, `cancelTask`, citizen XP/titles, milestones, 5m–60m economy sims pass |
| PixiJS 8 Isometric Renderer (`src/renderer`) | `BROWSER E2E TESTED` | `syncIfNeeded(worldState)` gating, cached labels/colors, idle sort skip, `prefers-reduced-motion` |
| Operator Dashboard & OBS `/stage` (`src/ui`) | `BROWSER E2E TESTED` | Verified on Vite Preview `127.0.0.1:4173` (canvas, simulator `VÀO`/`GỖ`, `/stage` isolation, ARIA) |
| Authoritative HTTP/WS Server (`src/server`) | `LOCAL SERVER INTEGRATION TESTED` | `timingSafeEqual` auth, query-token `400`, >64KB `413`, JSON sanitization, security headers, WS sync |
| Disk Persistence (`FilePersistenceAdapter`) | `UNIT TESTED` | FIFO per-key saves, valid-only backup rotation, Windows rename retry, `os.tmpdir()` recovery suite |
| Live Bridge Adapter (`TikTokLiveAdapter` + Transport) | `LOCAL SERVER INTEGRATION TESTED` / `PARTIALLY MITIGATED` / `BLOCKED` | Conformance tested vs RFC 6455 mock bridge + redacted fixtures; DNS rebinding `PARTIALLY MITIGATED`; real TikTok live room `BLOCKED` |

---

## 2. Current Verification Baseline

- `npm run typecheck`: Pass (`0` errors)
- `npm run lint`: Pass (`0` warnings/errors)
- `npm test`: Pass (`22` test files, `123` tests)
- `npm run build`: Pass (`tsc && vite build`)
- `npm run test:smoke`: Pass (authoritative `GameServer` + WebSocket + negative auth/body matrix)
- `npm run test:load`: Pass (`60` active citizens, `500` ticks, `p95TickMs < 0.2ms`, `snapshot ~48 KB`)
- Real Browser Check: Pass on `http://127.0.0.1:4173/` and `/stage` (`0` console errors, `0` failed requests)

See [TEST_MATRIX.md](file:///c:/Users/Zev/Desktop/live-city/docs/TEST_MATRIX.md), [PERFORMANCE_REPORT.md](file:///c:/Users/Zev/Desktop/live-city/docs/PERFORMANCE_REPORT.md), and [RELEASE_READINESS.md](file:///c:/Users/Zev/Desktop/live-city/docs/RELEASE_READINESS.md).
