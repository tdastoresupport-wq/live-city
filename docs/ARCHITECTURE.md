# LIVE CITY — KIẾN TRÚC HỆ THỐNG (ARCHITECTURE SPECIFICATION)

Tài liệu này mô tả kiến trúc hoàn chỉnh của **LIVE CITY** sau khi nâng cấp từ bản Prototype (Phase 00) lên hệ thống **Stream-Ready Interactive City Runtime** (P0 → P5).

---

## 1. SO SÁNH KIẾN TRÚC TRƯỚC VÀ SAU NÂNG CẤP

| Thành phần | Trước nâng cấp (Phase 00) | Sau nâng cấp (Stream-Ready Runtime) |
| :--- | :--- | :--- |
| **Nguồn trạng thái (Source of Truth)** | Chạy cục bộ trong từng tab trình duyệt (`LocalStorage`). Mở 2 tab sẽ sinh ra 2 thế giới lệch nhau. | **Local Node.js Game Server (`127.0.0.1`)** chạy `GameEngine` ở chế độ headless. Mọi màn hình dùng chung 1 trạng thái duy nhất. |
| **Đồng bộ OBS & Dashboard** | Chung 1 màn hình, chưa có route `/stage` độc lập cho OBS. | Tách biệt **Operator Dashboard (`/`)** và **OBS Stage (`/stage` — 1080×1920)** đồng bộ thời gian thực qua WebSocket `/ws`. |
| **WorldState Notification** | `pushEvent()` không gọi `notify()`; các thao tác phức hợp gọi `notify()` lặp lại nhiều lần. | Giao dịch **`batch(fn)`** và cờ `isDirty`. Mọi thay đổi state và `pushEvent()` phát thông báo chính xác 1 lần sau mỗi transaction. |
| **Máy trạng thái Cư dân (FSM)** | Lệnh mới ghi đè ngay khi đang vác hàng (`carrying_resource`), làm mất tài nguyên đang mang. | **Bảo toàn Cargo tuyệt đối**: Lệnh mới được xếp vào `queuedTask` và tự động thực thi ngay sau khi cư dân cất xong hàng vào kho. |
| **Pathfinding** | A* dùng Manhattan cho 8 hướng và có fallback đi thẳng xuyên qua sông nước khi tắc đường. | A* với **Octile Heuristic** chuẩn 8 hướng, cấm cắt góc qua vật cản, trả về `[]` khi không có đường (tuyệt đối không đi xuyên nước). |
| **Lưu trữ (Persistence)** | Snapshot v1 trên `LocalStorage`, mất `maxStorage` đã nâng cấp sau khi tải lại. | **Snapshot v2** + `FilePersistenceAdapter` (`.data/world_save.json` + `.backup.json`), hỗ trợ migrate từ v1, xác thực schema runtime. |
| **PixiJS 8 Renderer** | Các layer tách rời khiến mọi citizen luôn đè lên mọi công trình; vẽ lại Graphics mỗi frame. | **Unified Depth Scene (`zIndex = (x+y)*100`)**, dirty flags cho địa hình/mỏ/công trình/cư dân, dùng chung `TextStyle`, giới hạn 60 active entities. |

---

## 2. SƠ ĐỒ PHÂN TẦNG KIẾN TRÚC (LAYERED ARCHITECTURE)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION CLIENTS                             │
│  ┌─────────────────────────────────┐  ┌───────────────────────────────┐ │
│  │    Operator Dashboard (/)       │  │     OBS Browser Source        │ │
│  │  • Quản lý dự án & Biểu quyết   │  │  • Route: /stage (1080x1920)  │ │
│  │  • Phát động Sự kiện thành phố  │  │  • Tùy chọn ?bg=transparent   │ │
│  │  • Comment Simulator & Live Cfg │  │  • Không có nút quản trị      │ │
│  └────────────────┬────────────────┘  └───────────────┬───────────────┘ │
│                   │     GameRuntimeClient (WS + HTTP) │                 │
└───────────────────┼───────────────────────────────────┼─────────────────┘
                    │        ws://127.0.0.1/ws          │
┌───────────────────▼───────────────────────────────────▼─────────────────┐
│                LOCAL NODE.JS GAME SERVER (127.0.0.1)                    │
│  • Origin Verification (Loopback only) & Operator Session Token Auth    │
│  • HTTP Control Endpoints (/api/status, /api/snapshot, /api/command...) │
│  • RFC 6455 WebSocket Realtime Broadcaster & 15s Heartbeat              │
├─────────────────────────────────────────────────────────────────────────┤
│                    HEADLESS CORE GAME ENGINE (DI)                       │
│  • Command Pipeline: Deduplicator ➔ CommandParser ➔ RateLimiter         │
│  • Domain Systems: CitizenSystem | ResourceSystem | BuildingSystem      │
│  • WorldState: Transactional Batching, Invariants, Fog of War, Voting   │
├───────────────────────────────────┬─────────────────────────────────────┤
│        LIVE EVENT ADAPTERS        │        PERSISTENCE ADAPTERS         │
│  • MockLiveAdapter (Offline/Test) │  • FilePersistenceAdapter (.data/)  │
│  • TikTokLiveAdapter (Bridge/WS)  │  • LocalStoragePersistence          │
└───────────────────────────────────┴─────────────────────────────────────┘
```

---

## 3. CÁC MODULE TRỌNG YẾU

1. **`src/core/state/WorldState.ts`**:
   - Quản lý toàn bộ trạng thái thành phố, bất biến tài nguyên, bản đồ sương mù (`tile.discovered`), phiên biểu quyết (`activeVote`), sự kiện cộng đồng (`activeEvent`) và Snapshot v2.
2. **`src/core/systems/CitizenSystem.ts`**:
   - Điều khiển vòng đời cư dân, giới hạn số cư dân hoạt động (`activeCitizensCap`), cơ chế nghỉ ngơi khi không tương tác (`isResting`), hàng đợi nhiệm vụ bảo toàn cargo (`queuedTask`) và tìm đường A*.
3. **`src/core/systems/BuildingSystem.ts`**:
   - Kiểm tra cấp độ mở khóa (`unlockedAtLevel`), kiểm tra va chạm/mặt nước (`canPlaceBuilding`), tiêu thụ tài nguyên nguyên tử (`consumeResourcesAtomic`) và điều phối biểu quyết cộng đồng (`openVotingSession`, `castVote`, `closeVotingSession`).
4. **`src/core/systems/ResourceSystem.ts`**:
   - Tái tạo mỏ tài nguyên, chu kỳ kinh tế Thực phẩm & Vàng (Nông trại, Thương hội, tiêu thụ lương thực của cư dân đang làm việc), giao thương đổi Vàng (`tradeForGold`) và sự kiện thành phố (`startCityEvent`).
5. **`src/server/GameServer.ts` & `src/server/wsProtocol.ts`**:
   - Máy chủ Node.js gắn kết trực tiếp vào cổng `127.0.0.1`, cung cấp REST API và WebSocket đồng bộ trạng thái giữa Dashboard và OBS Stage.
6. **`src/renderer/PixiWorldRenderer.ts`**:
   - Bộ dựng hình Isometric 2.5D trên PixiJS 8 với sắp xếp độ sâu hợp nhất (`sceneObjectsContainer`), dirty flags, nội suy chuyển động 60 FPS và dọn dẹp bộ nhớ an toàn trong React StrictMode.
