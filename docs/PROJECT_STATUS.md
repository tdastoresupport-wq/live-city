# LIVE CITY — PROJECT STATUS (`PROJECT_STATUS.md`)

**Official Repository:** `https://github.com/tdastoresupport-wq/live-city`  
**Branch:** `main`  
**Baseline Audited Commit:** `96c4d0d7e67de74a3c87f452e1cb74b13de56c35`  
**Sprint Stage:** Phase 00 Forensics & Stage 1 Baseline Complete (Continuing Stages 2 → 7)

---

## 1. EXECUTIVE SUMMARY

LIVE CITY is an interactive 2.5D isometric livestream city builder powered by React 19, TypeScript, Vite 8, PixiJS 8, and an authoritative local Node.js `GameServer` (`127.0.0.1`). It separates headless simulation (`GameEngine`), rendering (`PixiWorldRenderer`), transport/live ingestion (`MockLiveAdapter`, `TikTokLiveAdapter`, `WebSocketBridgeTransport`), and presentation (`/` Operator Dashboard and `/stage` 1080×1920 OBS Browser Source).

---

## 2. MODULE INVENTORY & VERIFICATION MATRIX

| Subsystem | Primary Files | Implementation Status | Highest Verification Level |
| :--- | :--- | :--- | :--- |
| **Core World State & Snapshots** | [src/core/state/WorldState.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/state/WorldState.ts), [initialWorld.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/state/initialWorld.ts) | Implemented (v1/v2 snapshots, batching, resource invariants) | `UNIT TESTED` |
| **Citizen FSM & Pathfinding** | [CitizenSystem.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/systems/CitizenSystem.ts), [pathfinding.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/utils/pathfinding.ts) | Implemented (cargo queue, cap/rest, A* Octile) | `UNIT TESTED` |
| **Economy, Voting & Buildings** | [ResourceSystem.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/systems/ResourceSystem.ts), [BuildingSystem.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/systems/BuildingSystem.ts) | Implemented (4 resources, 5 events, 1-vote-per-user) | `UNIT TESTED` |
| **Command Pipeline** | [CommandParser.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/commands/CommandParser.ts), [CommandDispatcher.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/commands/CommandDispatcher.ts), [Deduplicator.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/commands/Deduplicator.ts), [RateLimiter.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/commands/RateLimiter.ts) | Implemented (Vietnamese/English commands, dual rate-limit) | `UNIT TESTED` |
| **Authoritative Server & WS Sync** | [GameServer.ts](file:///c:/Users/Zev/Desktop/live-city/src/server/GameServer.ts), [wsProtocol.ts](file:///c:/Users/Zev/Desktop/live-city/src/server/wsProtocol.ts), [index.ts](file:///c:/Users/Zev/Desktop/live-city/src/server/index.ts) | Implemented (HTTP + RFC 6455 WS, standalone ESM fixed via `scripts/ts-loader.mjs`) | `LOCAL SERVER INTEGRATION TESTED` |
| **Local Security Controls** | [GameServer.ts](file:///c:/Users/Zev/Desktop/live-city/src/server/GameServer.ts), [WebSocketBridgeTransport.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/adapters/WebSocketBridgeTransport.ts) | Implemented (Origin/Host allowlist, token auth, IPv4/IPv6/DNS fail-closed) | `LOCAL SERVER INTEGRATION TESTED` / `PARTIALLY MITIGATED` (DNS TOCTOU) |
| **Live Event Adapters** | [MockLiveAdapter.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/adapters/MockLiveAdapter.ts), [TikTokLiveAdapter.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/adapters/TikTokLiveAdapter.ts) | Mock ready; External Bridge tested via RFC 6455 mock bridge | `MOCK INTEGRATION TESTED` / `BLOCKED` (Real TikTok live session) |
| **Persistence Adapters** | [FilePersistenceAdapter.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/adapters/FilePersistenceAdapter.ts), [LocalStoragePersistence.ts](file:///c:/Users/Zev/Desktop/live-city/src/core/adapters/LocalStoragePersistence.ts) | Implemented (Stage 5 atomic queue & crash recovery queued) | `UNIT TESTED` |
| **PixiJS 8 Isometric Renderer** | [PixiWorldRenderer.ts](file:///c:/Users/Zev/Desktop/live-city/src/renderer/PixiWorldRenderer.ts), [EntityRenderer.ts](file:///c:/Users/Zev/Desktop/live-city/src/renderer/EntityRenderer.ts), [IsometricGrid.ts](file:///c:/Users/Zev/Desktop/live-city/src/renderer/IsometricGrid.ts), [StructureRenderer.ts](file:///c:/Users/Zev/Desktop/live-city/src/renderer/StructureRenderer.ts), [ResourceRenderer.ts](file:///c:/Users/Zev/Desktop/live-city/src/renderer/ResourceRenderer.ts), [CameraController.ts](file:///c:/Users/Zev/Desktop/live-city/src/renderer/CameraController.ts) | Implemented (unified depth sorting, dirty flags, viewport webview verified) | `BROWSER E2E TESTED` (Vite Preview webview) |
| **Dashboard & OBS `/stage` UI** | [App.tsx](file:///c:/Users/Zev/Desktop/live-city/src/ui/App.tsx), [StreamStage.tsx](file:///c:/Users/Zev/Desktop/live-city/src/ui/components/StreamStage.tsx), [CityInspector.tsx](file:///c:/Users/Zev/Desktop/live-city/src/ui/components/CityInspector.tsx), [GameRuntimeClient.ts](file:///c:/Users/Zev/Desktop/live-city/src/ui/services/GameRuntimeClient.ts) | Implemented (read-only stage, no split-brain fallback) | `BROWSER E2E TESTED` (Vite Preview webview) / `NOT TESTED` (OBS Desktop App) |
