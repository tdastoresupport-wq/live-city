# LIVE CITY — Release Readiness & Risk Sign-Off

**Release Target:** Production Release Candidate (`main`)  
**Current Engineering Scope:** Foundation + Engine Invariants + Renderer/UI Polish + Bridge Conformance + Atomic Persistence + Server Security + CI/CD Verification

---

## 1. Go / No-Go Checklist

| Release Criterion | Status | Evidence |
|---|---|---|
| Clean `npm ci` reproducible lockfile | PASS | `package-lock.json` unmodified and synchronized (`0.2.0`) |
| `tsc --noEmit` & `vite build` clean | PASS | Zero TypeScript errors; production bundle built |
| Zero ESLint warnings/errors | PASS | `npm run lint` (`--max-warnings 0`) passed |
| Automated unit & integration tests | PASS | `22/22` Vitest files (`123` tests) passing |
| Headless server & WS smoke test | PASS | `npm run test:smoke` verified against real `GameServer` |
| Multi-horizon 60m economy & 60-citizen load budget | PASS | 60 active citizens `p95` tick `< 0.2ms` (budget `< 25ms`); 60m simulation sustains positive progression |
| Crash-safe atomic disk persistence | PASS | FIFO queued saves, PID/counter temps, valid-only `.backup.json` rotation |
| Local operator auth & input limits | PASS | `timingSafeEqual` token check, query token `400`, >64KB `413`, JSON prototype stripping |
| Real browser `/` & `/stage` verification | PASS | Verified on Vite Preview `http://127.0.0.1:4173` (PixiJS canvas + HUD + `/stage` isolation) |
| External TikTok Live bridge verification | `BLOCKED` | Verified strictly with local RFC 6455 mock bridge & redacted fixtures (`docs/BRIDGE_PROTOCOL.md`) |

---

## 2. Residual Known Risks & Mitigations

1. **DNS Rebinding TOCTOU (`PARTIALLY MITIGATED`):**  
   `WebSocketBridgeTransport` validates hostnames via Node `dns.promises.lookup({ all: true })` fail-closed before connecting, which stops static SSRF hostnames pointing to private IPs. However, a short-TTL malicious authoritative DNS responder flipping A/AAAA records between `dns.promises.lookup` and the underlying WebSocket TCP handshake remains a theoretical TOCTOU risk without an allowlisted TLS bridge host. **Operational control:** Run `LIVE_CITY_ALLOWED_BRIDGE_HOSTS` with explicit trusted bridge hosts or restrict to local loopback (`127.0.0.1`).
2. **Untested Real TikTok Live Webcast Connection (`BLOCKED`):**  
   Direct end-to-end streaming against live TikTok servers cannot run inside offline CI. Before going live on stream, operators must follow [LOCAL_STREAM_SETUP.md](file:///c:/Users/Zev/Desktop/live-city/docs/LOCAL_STREAM_SETUP.md) and confirm `Live & OBS` displays `ĐÃ XÁC MINH` (Strict ACK matched channel).
3. **Production Bundle Chunk Size Notice:**  
   Vite reports `index-*.js` at ~`671 KB` (`~199 KB` gzip) mainly due to bundling PixiJS `8.23` in a single main client chunk; acceptable for local OBS/Electron/browser hosting, noted in [TECH_DEBT.md](file:///c:/Users/Zev/Desktop/live-city/docs/TECH_DEBT.md) alongside unused `canvas-confetti`.

---

## 3. Verdict

**READY FOR LOCAL STREAM / SELF-HOSTED RELEASE CANDIDATE** with interactive Mock Simulator, Authoritative Node GameServer, OBS `/stage`, and Strict-ACK local WebSocket bridge support. Live external TikTok relay integration requires user-supplied local bridge testing on first stream launch.
