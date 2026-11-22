# LIVE CITY — Interactive Livestream City Builder

LIVE CITY is an interactive 2.5D isometric city-building game designed for livestreaming. Viewers control persistent citizens via livestream chat comments to harvest resources, explore fog-of-war frontiers, vote on city construction, build landmarks, unlock milestones, and watch the city evolve live on OBS.

---

## Key Capabilities

- **Authoritative Simulation Engine (`src/core`):**
  - Headless Node.js `GameEngine` decoupled from PixiJS rendering.
  - Citizen FSM (`idle`, `moving_to_harvest`, `harvesting`, `carrying_resource`, `moving_to_build`, `building`, `exploring`, `isResting`) with strict cargo preservation (`carriedResource` never dropped on reassignment or `cancelTask()`).
  - Viewer Citizen Progression (`xp`, capped `level` `1..20`, titles `Tân Binh` -> `Thợ Lành Nghề` -> `Kiến Trúc Sư` -> `Nguyên Soái` -> `Huyền Thoại`) and persistent `CityMilestone` awards.
  - Octile A* pathfinding, multi-tile building perimeter routing, mid-action harvest/build recovery, and community voting with deterministic tie-breaking + queued `pendingVotedProject`.
- **PixiJS 8 Isometric Renderer (`src/renderer`):**
  - Version-gated rendering (`PixiWorldRenderer.syncIfNeeded(worldState)`), idle sort skipping, cached entity label/color updates, and OS `prefers-reduced-motion` support.
- **Operator Dashboard & OBS Stage (`src/ui`):**
  - `/` Operator Dashboard with interactive livestream comment simulator, citizen progression badges, milestone pills, project planner, and accessibility labels / `:focus-visible` controls.
  - `/stage` (`1080 × 1920`, optional `?bg=transparent`) strictly read-only OBS Browser Source synchronized via WebSocket without fallback simulation split-brain.
- **Hardened Server & Bridge Adapters (`src/server`, `src/core/adapters`):**
  - Loopback-bound HTTP/WebSocket `GameServer` with `crypto.timingSafeEqual` `x-operator-token` auth, strict Origin/Host allowlist, query-token rejection (`400`), `64 KB` JSON limit (`413`), `__proto__` stripping, and defensive security headers.
  - Atomic serialized `FilePersistenceAdapter` with valid-only `.backup.json` rotation and schema-aware recovery.
  - `TikTokLiveAdapter` + `WebSocketBridgeTransport` supporting strict channel-matched subscription ACKs, SSRF/private-IP blocking, anti-replay, and authoritative receive-time stamping.

---

## Quick Start

### 1. Install Dependencies
```bash
npm ci
```

### 2. Run Authoritative Server & Frontend (Development)
Start the Node.js authoritative server (port `4000` by default):
```bash
npm run server
```
In another terminal, start the Vite Dashboard/Stage frontend:
```bash
npm run dev
```
- Operator Dashboard: `http://127.0.0.1:5173/`
- OBS Browser Source Stage: `http://127.0.0.1:5173/stage` (or `/stage?bg=transparent`)

See [docs/LOCAL_STREAM_SETUP.md](file:///c:/Users/Zev/Desktop/live-city/docs/LOCAL_STREAM_SETUP.md) for environment configuration and OBS integration details.

---

## Verification & Quality Commands

```bash
npm run typecheck   # TypeScript strict check
npm run lint        # ESLint (--max-warnings 0)
npm test            # Full Vitest suite (22 files, 123 tests)
npm run build       # Production tsc + Vite bundle build
npm run test:smoke  # Real GameServer HTTP + WS + negative security smoke test
npm run test:load   # 60-citizen 500-tick headless benchmark
```

---

## Documentation Index

- Architecture & Data Flow: [ARCHITECTURE.md](file:///c:/Users/Zev/Desktop/live-city/docs/ARCHITECTURE.md) · [DATA_FLOW.md](file:///c:/Users/Zev/Desktop/live-city/docs/DATA_FLOW.md)
- Gameplay & Viewer Commands: [GAMEPLAY.md](file:///c:/Users/Zev/Desktop/live-city/docs/GAMEPLAY.md)
- Local Stream & OBS Setup: [LOCAL_STREAM_SETUP.md](file:///c:/Users/Zev/Desktop/live-city/docs/LOCAL_STREAM_SETUP.md)
- Bridge Protocol Contract: [BRIDGE_PROTOCOL.md](file:///c:/Users/Zev/Desktop/live-city/docs/BRIDGE_PROTOCOL.md)
- Security & Threat Mitigations: [SECURITY.md](file:///c:/Users/Zev/Desktop/live-city/docs/SECURITY.md)
- Test Coverage & Performance: [TEST_MATRIX.md](file:///c:/Users/Zev/Desktop/live-city/docs/TEST_MATRIX.md) · [PERFORMANCE_REPORT.md](file:///c:/Users/Zev/Desktop/live-city/docs/PERFORMANCE_REPORT.md)
- Release Sign-Off & Audits: [RELEASE_READINESS.md](file:///c:/Users/Zev/Desktop/live-city/docs/RELEASE_READINESS.md) · [PROJECT_STATUS.md](file:///c:/Users/Zev/Desktop/live-city/docs/PROJECT_STATUS.md) · [TECH_DEBT.md](file:///c:/Users/Zev/Desktop/live-city/docs/TECH_DEBT.md) · [FEATURE_TRACEABILITY.md](file:///c:/Users/Zev/Desktop/live-city/docs/FEATURE_TRACEABILITY.md)
