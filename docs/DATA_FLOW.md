# LIVE CITY — Data & Command Flow

---

## 1. End-to-End Viewer Action Pipeline

1. **Ingress (`MockLiveAdapter`, `/api/command`, or `TikTokLiveAdapter`):**
   - Viewer comment/gift/like arrives as JSON (local simulator, HTTP webhook `/api/live/webhook`, or external WebSocket bridge frame).
   - `WebSocketBridgeTransport.normalizePayload` normalizes Convention A (`type`) and Convention B (`event + data`) wire formats.
   - `TikTokLiveAdapter.handleIncomingPayload` validates `maxReplayAgeMs` (`120_000` ms default), deduplicates via `Deduplicator`, and emits normalized events stamped with authoritative receive clock (`timestamp: now`).
2. **Command Validation & Throttling (`CommandDispatcher`):**
   - `CommandParser` normalizes bilingual Vietnamese/English aliases and caps comments/nicknames.
   - `RateLimiter` applies monotonic per-user cooldowns and global flood protection.
3. **Simulation Mutation (`WorldState` & Systems):**
   - Mutations run inside `WorldState.batch(...)` which increments monotonic `stateVersion`, invalidates cached `discoveredTiles`, evaluates `checkAndUnlockMilestones()`, and notifies subscribers cleanly.
   - `CitizenSystem` moves citizens via Octile A* (`findPath`), preserves `carriedResource` across reassignments and `cancelTask()`, recovers mid-action when nodes deplete or buildings finish, and grants progression XP (`xp`/`level`/`title`).
4. **Broadcast & Render (`GameServer` -> `PixiWorldRenderer`):**
   - `GameServer` broadcasts compact JSON snapshots over `/ws`.
   - `StreamStage` drives `PixiWorldRenderer.syncIfNeeded(worldState)`, updating Pixi containers only when `worldState.getStateVersion()` advances.
5. **Disk Persistence (`FilePersistenceAdapter`):**
   - `GameEngine` auto-saves every 30s (`world_save`) and on clean shutdown.
   - Saves serialize per key via `saveQueues`, validate current `.json` before rotating `.backup.json`, write to PID/counter unique `.tmp.json`, and atomically rename with Windows retry handling.
