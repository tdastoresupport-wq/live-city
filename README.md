# LIVE CITY — Interactive Livestream Simulation Game
## Phase 00: Foundation & Project Engineering

**LIVE CITY** là một trò chơi tương tác livestream thời gian thực nơi khán giả điều khiển cư dân, khai thác tài nguyên, cùng nhau xây dựng các kỳ quan kiến trúc và khám phá một thành phố tồn tại lâu dài (persistent world).

Dự án tuân thủ nghiêm ngặt nguyên tắc: **Game Engine tách rời hoàn toàn khỏi UI và tách rời khỏi API livestream cụ thể.**

---

## 🌐 REPOSITORY CHÍNH THỨC
- **GitHub:** https://github.com/tdastoresupport-wq/live-city
- **Clone URL:** `https://github.com/tdastoresupport-wq/live-city.git`
- **Default Branch:** `main`

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT VÀ KHỞI CHẠY (QUICK START)

### 1. Yêu cầu môi trường
- **Node.js**: v18.0.0 trở lên (khuyến nghị v20+)
- **NPM**: v9.0.0 trở lên

### 2. Cài đặt Dependencies
```bash
npm install
```

### 3. Khởi chạy môi trường phát triển (Dev Server)
```bash
npm run dev
```
Truy cập trình duyệt tại địa chỉ: `http://localhost:3000` (hoặc cổng hiển thị trong terminal).

### 4. Chạy toàn bộ Unit Tests
```bash
npm test
```

### 5. Build dự án cho Production
```bash
npm run build
npm run preview
```

---

## 🎮 CÁCH TƯƠNG TÁC QUA COMMENT SIMULATOR

Tại giao diện bên phải màn hình (hoặc bảng điều khiển), bạn có thể nhập tên người xem và thử nghiệm các lệnh sau:

| Lệnh | Ý nghĩa | Hành động của Cư dân |
| :--- | :--- | :--- |
| **`VÀO`** (hoặc `!vao`, `join`) | Gia nhập thành phố | Tạo cư dân đại diện xuất hiện tại Quảng trường trung tâm |
| **`GỖ`** (hoặc `!go`, `chặt gỗ`) | Khai thác gỗ | Tìm cây sồi/thông gần nhất, đốn củi và vác về kho thành phố |
| **`ĐÁ`** (hoặc `!da`, `khai thác đá`) | Khai thác đá | Tìm mỏ đá hoa cương, đập đá và vận chuyển về kho |
| **`XÂY`** (hoặc `!xay`, `xây nhà`) | Đóng góp xây dựng | Di chuyển đến công trình đang thi công (ví dụ: *Tháp Canh Hoàng Hôn*) để gõ búa tăng tiến độ |
| **`KHÁM PHÁ`** (hoặc `kham pha`, `!explore`) | Mở rộng lãnh thổ | Thám hiểm các vùng đất biên giới, mở bản đồ và nhận thưởng EXP |

---

## ⚙️ BỘ KIỂM THỬ KỸ THUẬT (ENGINEERING TESTS)

Dự án trang bị 9 bộ kiểm thử với 24 test cases hoàn chỉnh (`npm test`):

1. **`citizen.test.ts`**: Tạo mới cư dân, chống trùng lặp ID, khởi tạo chỉ số ban đầu.
2. **`harvesting.test.ts`**: Cơ chế khai thác gỗ và đá, chu kỳ thu hoạch và vận chuyển về kho.
3. **`resources.test.ts`**: Bất biến không âm tài nguyên, tôn trọng giới hạn sức chứa kho lưu trữ.
4. **`building.test.ts`**: Tiến độ xây dựng nhiều người đóng góp, bất biến hoàn thành công trình đúng ngưỡng.
5. **`command-parser.test.ts`**: Xử lý ngữ nghĩa tiếng Việt có dấu/không dấu, tiền tố lệnh (`!`, `/`), từ chối comment rác.
6. **`rate-limiter.test.ts`**: Giới hạn tốc độ gửi lệnh chống spam (cooldown per-user).
7. **`deduplication.test.ts`**: Chống xử lý trùng lặp sự kiện (sliding window TTL cache).
8. **`multi-user.test.ts`**: Kiểm tra nhiều người xem cùng tương tác đồng thời.
9. **`persistence.test.ts`**: Xuất snapshot trạng thái thành phố và khôi phục nguyên vẹn.

---

## 🏛️ CẤU TRÚC THƯ MỤC DỰ ÁN

```
live-city/
├── src/
│   ├── core/                      # Trái tim logic của trò chơi (hoàn toàn decoupled)
│   │   ├── types/                 # Domain types & interfaces (World, Citizen, Resource, Event)
│   │   ├── state/                 # Quản lý trạng thái thế giới (WorldState, Invariants, Initial Map)
│   │   ├── systems/               # Các hệ thống nghiệp vụ (Citizen, Resource, Building, Audio)
│   │   ├── commands/              # Pipeline xử lý lệnh (Parser, RateLimiter, Deduplicator, Dispatcher)
│   │   ├── adapters/              # Giao tiếp ngoại vi (MockLiveAdapter, LocalStoragePersistence)
│   │   ├── engine/                # Main game loop, tick delta time orchestrator (GameEngine)
│   │   └── utils/                 # Math isometric, A* pathfinding, id generation
│   ├── renderer/                  # Bộ hiển thị đồ họa Isometric 2.5D (PixiJS v8)
│   │   ├── PixiWorldRenderer.ts   # Facade điều phối renderer và camera
│   │   ├── IsometricGrid.ts       # Địa hình isometric (cỏ, nước dập dềnh, đường đá, quảng trường)
│   │   ├── ResourceRenderer.ts    # Cây cối lay động trong gió, mỏ đá hoa cương
│   │   ├── StructureRenderer.ts   # Tòa thị chính, kho thóc, giàn giáo thi công
│   │   ├── EntityRenderer.ts      # Cư dân hoạt ảnh bước đi, vác tài nguyên, bóng đổ, name tag
│   │   └── CameraController.ts    # Pan, zoom, focus trung tâm, phím điều hướng
│   ├── ui/                        # Giao diện sân khấu livestream & điều khiển (React 19)
│   │   ├── components/
│   │   │   ├── StreamStage.tsx    # Khung chiếu livestream 9:16 hoặc toàn màn hình
│   │   │   ├── StreamHUD.tsx      # Thanh trạng thái thành phố, cấp độ, thời tiết ngày/đêm
│   │   │   ├── BuildingProgressBar.tsx # Tiến độ công trình đang thi công trực quan
│   │   │   ├── LiveActivityFeed.tsx    # Dòng sự kiện thời gian thực (Ticker)
│   │   │   ├── LeaderboardHUD.tsx      # Bảng vinh danh top thợ đốn củi, thợ mỏ, thợ xây
│   │   │   ├── CommentSimulator.tsx    # Bảng mô phỏng comment, nút lệnh nhanh & bot tự động
│   │   │   ├── CityInspector.tsx       # Chi tiết cư dân, công trình và tài nguyên
│   │   │   └── ControlsToolbar.tsx     # Cụm phím điều khiển (Reset, Mute, Recenter, Save)
│   │   └── App.tsx                # Ứng dụng gốc kết nối Engine với UI
│   ├── test/                      # 9 Test suites kiểm thử tự động với Vitest
│   └── main.tsx                   # Điểm khởi động ứng dụng web
├── docs/
│   ├── ARCHITECTURE.md            # Tài liệu kiến trúc chuyên sâu
│   └── DATA_FLOW.md               # Sơ đồ luồng dữ liệu (Mermaid)
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 📦 DANH SÁCH DEPENDENCIES

### Runtime Dependencies:
- **`pixi.js` (^8.16.0)**: Công cụ dựng hình 2D WebGL/WebGPU hiệu năng cao cho thế giới isometric.
- **`react` & `react-dom` (^19.2.4)**: Framework xây dựng giao diện lớp điều khiển và stream HUD.
- **`lucide-react` (^1.16.0)**: Bộ icon trực quan sang trọng cho HUD và hệ thống bảng tin.
- **`canvas-confetti` (^1.9.4)**: Hiệu ứng pháo hoa khi thành phố thăng cấp hoặc hoàn tất kỳ quan.

### Dev & Testing Dependencies:
- **`typescript` (^6.0.2)**: Đảm bảo kiểm tra kiểu tĩnh ở chế độ `strict`.
- **`vite` (^8.3.8)**: Bộ bundler thế hệ mới với Hot Module Replacement siêu tốc.
- **`vitest` (^4.1.2)**: Khung kiểm thử đơn vị hiện đại tương thích hoàn toàn với Vite ESM.
- **`tailwindcss` (^4.3.5) & `@tailwindcss/vite`**: Hệ thống tạo kiểu tiện ích cho UI livestream cozy.
