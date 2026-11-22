# LIVE CITY — Stream-Ready Interactive 2.5D Isometric City Game

**LIVE CITY** là một trò chơi thành phố isometric 2.5D tương tác trực tiếp với livestream. Khán giả sử dụng bình luận để tạo cư dân riêng, khai thác tài nguyên (Gỗ, Đá, Thực phẩm, Vàng), vận chuyển hàng về kho, tham gia thi công các công trình, biểu quyết dự án tiếp theo và mở rộng bản đồ sương mù (Fog of War) trong một thế giới tồn tại lâu dài qua nhiều buổi phát sóng.

---

## 🌐 REPOSITORY CHÍNH THỨC
- **GitHub:** https://github.com/tdastoresupport-wq/live-city
- **Clone URL:** `https://github.com/tdastoresupport-wq/live-city.git`
- **Default Branch:** `main`

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT VÀ KHỞI CHẠY (QUICK START)

### 1. Yêu cầu môi trường
- **Node.js**: v22.x trở lên (khuyến nghị Node 22 LTS hoặc Node 24)
- **NPM**: v10+

### 2. Cài đặt Dependencies
```bash
npm install
```

### 3. Khởi chạy Local Game Server & Giao diện (Dev Mode)
```bash
npm run dev
```
Lệnh này tự động khởi chạy **Authoritative Local Game Server** gắn trên `127.0.0.1:3000` cùng giao diện Web:
- **Operator Dashboard (Màn hình điều khiển):** `http://127.0.0.1:3000/`
- **OBS Browser Source Stage (Màn hình sân khấu 1080×1920):** `http://127.0.0.1:3000/stage`
- **OBS Stage nền trong suốt:** `http://127.0.0.1:3000/stage?bg=transparent`

### 4. Các lệnh kiểm tra chất lượng & vận hành
```bash
# Kiểm tra kiểu tĩnh TypeScript (Strict Mode)
npm run typecheck

# Chạy Linter kiểm tra mã nguồn
npm run lint

# Chạy toàn bộ 13 bộ Unit & Integration Tests (49 test cases)
npm test

# Build bản Production và chạy máy chủ Preview (trên 127.0.0.1:4173)
npm run build
npm run preview

# Hoặc chạy riêng Headless Node.js Game Server độc lập (trên 127.0.0.1:4000)
npm run server
```

---

## 🎮 TẬP LỆNH TƯƠNG TÁC CHO KHÁN GIẢ LIVESTREAM

| Lệnh bình luận | Alias hỗ trợ | Hành động trong thế giới LIVE CITY |
| :--- | :--- | :--- |
| **`VÀO`** | `!vao`, `join`, `tham gia` | Tạo cư dân riêng xuất hiện tại Quảng trường trung tâm. |
| **`GỖ`** | `!go`, `wood`, `chặt gỗ` | Di chuyển A* tới rừng đốn củi và vác về kho thành phố. |
| **`ĐÁ`** | `!da`, `stone`, `đào đá` | Di chuyển tới mỏ đá hoa cương/pha lê để khai thác. |
| **`LƯƠNG THỰC`** | `thực phẩm`, `food`, `hái quả` | Thu hoạch vườn quả mọng cung cấp lương thực nuôi cư dân. |
| **`XÂY`** | `!xay`, `build`, `xây nhà` | Di chuyển tới công trường đang mở để gõ búa tăng tiến độ. |
| **`KHÁM PHÁ`** | `!explore`, `thám hiểm` | Tiến vào vùng sương mù (Fog of War), mở sáng bản đồ và tìm mỏ ẩn. |
| **`VOTE 1..3`** | `bình chọn 1`, `bầu 2` | Bỏ phiếu bầu chọn công trình xây dựng tiếp theo (mỗi người 1 phiếu). |
| **`ĐỔI VÀNG`** | `giao thương`, `trade` | Đổi 20 Gỗ/Đá dư thừa trong kho lấy Vàng tại Thương Hội. |

> **Đặc tính bảo toàn Cargo:** Nếu cư dân đang vác tài nguyên về kho (`carrying_resource`) mà người xem gõ lệnh mới, cư dân sẽ lưu lệnh mới vào hàng đợi cá nhân (`queuedTask`), hoàn tất việc nộp hàng vào kho rồi mới chuyển sang nhiệm vụ tiếp theo — tuyệt đối không bao giờ làm mất tài nguyên.

---

## 📚 TÀI LIỆU KỸ THUẬT & VẬN HÀNH CHI TIẾT

- [docs/UPGRADE_AUDIT.md](./docs/UPGRADE_AUDIT.md) — Báo cáo rà soát lỗi Phase 00 và lộ trình nâng cấp P0 → P5.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — Kiến trúc hệ thống Local Game Server, Headless Engine, DI và Unified Depth Renderer.
- [docs/DATA_FLOW.md](./docs/DATA_FLOW.md) — Sơ đồ luồng dữ liệu WebSocket Realtime, FSM Cargo Queue và Biểu quyết cộng đồng.
- [docs/GAMEPLAY.md](./docs/GAMEPLAY.md) — Cơ chế kinh tế 4 tài nguyên, bonus công trình, Fog of War, Voting và Sự kiện thành phố.
- [docs/LOCAL_STREAM_SETUP.md](./docs/LOCAL_STREAM_SETUP.md) — Hướng dẫn thiết lập OBS Browser Source (`1080×1920`) và kết nối Livestream.
- [docs/SECURITY.md](./docs/SECURITY.md) — Chính sách bảo mật Loopback `127.0.0.1`, Origin check, Operator Token và chống Spam/Replay.
- [AGENTS.md](./AGENTS.md) — Quy chuẩn phát triển và đồng bộ GitHub bắt buộc.
