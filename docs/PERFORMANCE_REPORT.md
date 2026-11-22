# LIVE CITY — Performance & Load Benchmark Report

**Environment:** Local headless Node.js runtime (`node --import ./scripts/ts-loader.mjs --experimental-strip-types scripts/run-load-test.ts`) + Vitest automated budget tests.

---

## 1. Reproducible Headless Benchmark Results (`npm run test:load`)

Measured on `scripts/run-load-test.ts` running 60 active citizens over 500 fixed engine ticks (`dt = 0.05s`, 25s simulated game time) alongside 460 dispatched viewer commands and 20 full `WorldState.toSnapshot()` JSON serialization cycles:

| Metric | Measured Result | Configured Gate Budget | Status |
|---|---|---|---|
| Active Citizens Spawned | `60` | `60` | PASS |
| Initial 60-Command Join Burst (`initial60DispatchMs`) | `8.034 ms` | `< 500 ms` | PASS |
| Total 500-Tick + Command Loop Time (`loopTotalMs`) | `18.688 ms` | `< 2000 ms` | PASS |
| Median Tick Latency (`p50TickMs`) | `0.014 ms` | `—` | PASS |
| Average Tick Latency (`avgTickMs`) | `0.029 ms` | `—` | PASS |
| P95 Tick Latency (`p95TickMs`) | `0.122 ms` | `< 25 ms` | PASS |
| Max Tick Latency (`maxTickMs`) | `0.568 ms` | `< 100 ms` | PASS |
| Average Snapshot JSON Serialize (`avgSnapshotJsonMs`) | `0.161 ms` | `< 50 ms` | PASS |
| Serialized Snapshot Size (`snapshotSizeKb`) | `48.01 KB` | `< 1024 KB` | PASS |
| Node Heap Delta (`heapStartMb` -> `heapEndMb`) | `9.4 MB -> 10.93 MB` (`+1.53 MB`) | Bounded | PASS |

---

## 2. Multi-Horizon Economy Balance (`src/test/engine-invariants-and-economy.test.ts`)

Measured with 8 concurrent viewer citizens under fixed `dt = 0.5s` deterministic ticks up to 3600 simulated seconds:

| Horizon | Wood | Stone | Food | Gold | City Level | Completed Buildings | Explored % | Milestones Unlocked |
|---|---|---|---|---|---|---|---|---|
| 5m (300s) | `160` | `516` | `472` | `197` | `5` | `8` | `90%` | `4` |
| 15m (900s) | `330` | `1000` | `999` | `320` | `6` | `14` | `90%` | `4` |
| 30m (1800s) | `1000` | `1000` | `999` | `500` | `7` | `14` | `90%` | `4` |
| 60m (3600s) | `1000` | `1000` | `998` | `500` | `7` | `14` | `90%` | `4` |

Note: Storage caps bind cleanly at initial/upgraded `maxStorage` without `NaN` or starvation deadlocks.

---

## 3. Persistence & Rendering Optimizations

- **Pixi Scene Sync Gating (`PixiWorldRenderer.syncIfNeeded`):** Avoids re-syncing DOM/Pixi containers when `WorldState.getStateVersion()` is unchanged between idle frames, and skips `sceneObjectsContainer.sortChildren()` when no entities moved during `update()`.
- **Entity Graphics Caching (`EntityRenderer`):** Caches `lastFloatColor` and `lastLevel` alongside `lastStateKey` so style mutation and text re-rasterization occur only when values change.
- **Discovery Tile Cache (`WorldState`):** Caches `discoveredTiles` array with dirty invalidation on `resetToInitial()`, `revealArea()`, and `loadSnapshot()`, removing repeated O(W*H) scans during snapshot serialization.
- **Serialized Atomic Persistence (`FilePersistenceAdapter`):** Serializes saves per key on a FIFO queue with PID/counter unique temp files, copies primary `.json` to `.backup.json` only after JSON + schema validation passes, and retries transient Windows `EPERM`/`EACCES`/`EBUSY` file locks on rename.

---

## 4. Scope Notes

- PixiJS WebGL GPU draw calls and browser frame timings are browser-dependent and are NOT benchmarked in headless Node `npm run test:load` (verified qualitatively via live preview browser checks).
- Server HTTP/WebSocket throughput at scale (>100 external stream sockets) was not load-tested against live network interfaces; benchmark scope covers single-node headless `GameEngine` simulation + command dispatch + snapshot serialization.
