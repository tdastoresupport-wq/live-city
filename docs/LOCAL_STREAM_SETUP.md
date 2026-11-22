# LIVE CITY — Local Streaming & OBS Setup Guide

---

## 1. Environment Configuration

Copy `.env.example` to `.env` before customizing runtime values (never commit `.env`):

```env
LIVE_CITY_HOST=127.0.0.1
LIVE_CITY_PORT=4000
LIVE_CITY_OPERATOR_TOKEN=
LIVE_CITY_ALLOWED_ORIGINS=http://127.0.0.1:3000,http://127.0.0.1:4173,http://127.0.0.1:5173
TIKTOK_BRIDGE_URL=
TIKTOK_REQUIRE_ACK=true
LIVE_CITY_ALLOW_LOOPBACK_BRIDGE=true
LIVE_CITY_ALLOWED_BRIDGE_HOSTS=
```

When `LIVE_CITY_OPERATOR_TOKEN` is left empty, `GameServer` generates a fresh ephemeral CSPRNG hex token on each startup and delivers it strictly to verified loopback/origin local dashboard sessions via `GET /api/auth/session`.

---

## 2. Running Locally for Broadcast

1. **Start Authoritative Game Server:**
   ```bash
   npm run server
   ```
   Persists saves safely in `.data/world_save.json` (plus `.backup.json`).

2. **Start UI / OBS Stage Server (Dev or Production Preview):**
   ```bash
   npm run dev
   # or production preview after npm run build:
   npm run preview -- --host 127.0.0.1 --port 4173
   ```

3. **Open Operator Dashboard:**  
   Navigate to `http://127.0.0.1:5173/` (or `:4173/`). Use the **Mô phỏng tương tác livestream** panel to test commands offline, manage builds/votes in **Dự án**, inspect viewer stats in **Cư dân**, or connect your local WebSocket bridge in **Live & OBS**.

---

## 3. OBS Studio Browser Source Setup

- Add a **Browser Source** in OBS Studio:
  - **URL:** `http://127.0.0.1:4173/stage` (or `http://127.0.0.1:4173/stage?bg=transparent` for overlay compositing)
  - **Width:** `1080`
  - **Height:** `1920`
  - Enable **Shutdown source when not visible** = unchecked (keeps live sync active).
- `/stage` connects read-only to `ws://127.0.0.1:4000/ws`, renders PixiJS canvas + HUD overlays + Leaderboard + Live Ticker, and strips all operator control buttons.

---

## 4. Connecting an External Local TikTok Bridge

1. Start your local WebSocket relay/bridge on loopback (e.g. `ws://127.0.0.1:21213`) conforming to [BRIDGE_PROTOCOL.md](file:///c:/Users/Zev/Desktop/live-city/docs/BRIDGE_PROTOCOL.md).
2. In Dashboard -> **Live & OBS**, enter the TikTok `@channel`, optional bridge URL (`ws://127.0.0.1:21213`), keep **Bắt buộc xác thực handshake (Strict ACK)** checked, and click **Kết nối TikTok Bridge**.
3. Wait until badge shows **`ĐÃ XÁC MINH`**. Note: Live external TikTok webcast connectivity cannot run in CI and requires live broadcaster verification before going live.
