# LIVE CITY — TECHNICAL AUDIT & UPGRADE PLAN (`UPGRADE_AUDIT.md`)

Tài liệu này ghi nhận kết quả rà soát kỹ thuật (Technical Audit) trên mã nguồn Phase 00 và kế hoạch nâng cấp theo 6 giai đoạn (P0 → P5).

---

## 1. KẾT QUẢ AUDIT MÃ NGUỒN HIỆN TẠI (PHASE 00)

### 1.1. Lỗi WorldState & Cơ chế Notification (P0.1)
- **Hiện trạng:** `WorldState.pushEvent()` chỉ thêm sự kiện vào mảng `eventLog` nhưng **không** gọi `this.notify()`. Khi có sự kiện độc lập (lệnh bị từ chối, thông báo hệ thống, mỏ tài nguyên hồi phục), React UI không cập nhật ngay. Ngược lại, một số thao tác phức hợp gọi `notify()` nhiều lần liên tiếp.
- **Hướng khắc phục:** Bổ sung cơ chế `batch()` / transaction và cờ `dirty`. Mọi thay đổi state hoặc `pushEvent()` đều đánh dấu dirty và phát thông báo có kiểm soát đúng 1 lần sau khi kết thúc thao tác.

### 1.2. Lỗi Máy trạng thái Cư dân & Mất Cargo (P0.2)
- **Hiện trạng:** Khi cư dân đang ở trạng thái `carrying_resource` (vác gỗ/đá về kho), nếu người xem gửi lệnh mới (`GỖ`, `ĐÁ`, `XÂY`, `KHÁM PHÁ`), `CitizenSystem` ghi đè ngay `state` và `path`, làm mất số tài nguyên đang mang trên lưng (`carriedResource`).
- **Hiện trạng:** Khi công trình hoàn thành hoặc mỏ cạn kiệt giữa chừng, các cư dân khác đang di chuyển tới đó chưa được chuyển trạng thái hoặc tìm mỏ thay thế hợp lý.
- **Hướng khắc phục:** 
  - Bảo vệ tuyệt đối `carriedResource`: Khi cư dân đang vác hàng về kho, lệnh mới sẽ được đưa vào hàng đợi nhiệm vụ cá nhân (`queuedTask`) và tự động thực thi ngay sau khi cư dân nộp xong hàng vào kho.
  - Chuẩn hóa điều kiện thành công / hủy / chuyển tiếp khi mục tiêu hoàn thành hoặc cạn kiệt.

### 1.3. Lỗi Pathfinding (P0.3)
- **Hiện trạng:** `findPath()` cho phép đi 8 hướng nhưng dùng heuristic Manhattan (không admissible cho đường chéo). Nguy hiểm hơn, khi không tìm được đường (vượt quá số bước hoặc bị chặn bởi sông/vật cản), hàm trả về đường thẳng nối trực tiếp tới đích (`return [{ x: effectiveTarget.x, y: effectiveTarget.y }]`), khiến cư dân đi xuyên qua mặt nước và vật cản. Кроме đó, ô nằm ngoài `tileMap` đang mặc định trả về `walkable = true`.
- **Hướng khắc phục:**
  - Chuyển sang heuristic Octile Distance chuẩn cho lưới 8 hướng.
  - Ô ngoài biên hoặc không tồn tại bắt buộc `walkable = false`.
  - Xét cả vùng chiếm chỗ của công trình và vật cản.
  - Bỏ hoàn toàn fallback đi xuyên vật cản; trả về kết quả rỗng/null khi không có đường để `CitizenSystem` từ chối hoặc chọn mục tiêu khác.

### 1.4. Lỗi Command Pipeline & False Positives (P0.4)
- **Hiện trạng:**
  - `CommandParser` dùng `clean.includes('kham pha')`, `clean.includes('xay nha')` và từ khóa `'di'`, dẫn đến nhận nhầm các câu chat thông thường (ví dụ: *"Đi ăn cơm đây"*, *"Đừng xây nhà ở đó"*) thành lệnh game.
  - Chưa giới hạn độ dài comment/username, chưa lọc ký tự điều khiển.
  - `RateLimiter` lưu `Map<string, number>` chưa có cơ chế dọn dẹp (garbage collection) các bản ghi cũ và thiếu giới hạn toàn cục (Global Rate Limit / Burst Protection).
- **Hướng khắc phục:**
  - Siết chặt cú pháp lệnh: chỉ nhận từ khóa lệnh rõ ràng, tiền tố (`!`, `/`, `#`) hoặc cụm lệnh ngắn hợp lệ, loại bỏ các khớp chuỗi con mơ hồ trong câu văn dài.
  - Bổ sung giới hạn độ dài, làm sạch chuỗi, dọn bộ nhớ `RateLimiter` định kỳ và thêm Global Burst Limiter.

### 1.5. Lỗi BuildingSystem & Kiểm tra Vị trí (P0.5)
- **Hiện trạng:**
  - `BuildingSystem.update()` tự động khởi công công trình mới mà không kiểm tra `unlockedAtLevel` và không qua quyết định của thành phố/biểu quyết.
  - `startNewProject()` chưa kiểm tra chồng lấn (collision) với mặt nước, mỏ tài nguyên hoặc công trình khác, và tiêu thụ tài nguyên chưa nguyên tử.
- **Hướng khắc phục:**
  - Kiểm tra điều kiện cấp độ (`unlockedAtLevel`), kiểm tra biên bản đồ, địa hình mặt đất và vùng chiếm chỗ trước khi đặt móng.
  - Tiêu thụ tài nguyên nguyên tử (atomic check-and-consume).
  - Tích hợp với hệ thống chọn dự án của Operator và Biểu quyết cộng đồng (Voting).

### 1.6. Lỗi Persistence & Khôi phục Kho Nâng cấp (P0.6)
- **Hiện trạng:** `WorldState.toSnapshot()` (version 1) chưa lưu `maxStorage` (sức chứa kho sau khi xây Kho Thóc), bản đồ sương mù (Fog of War), sự kiện và phiên biểu quyết. `loadSnapshot()` chưa xác thực schema sâu và chưa có bản sao lưu dự phòng (backup).
- **Hướng khắc phục:**
  - Nâng cấp lên Snapshot `version: 2`, hỗ trợ migrate tự động từ `version: 1`.
  - Lưu đầy đủ `maxStorage`, vùng đã khám phá, lịch sử biểu quyết, sự kiện thành phố.
  - Kiểm tra schema nghiêm ngặt ở runtime và giữ bản backup an toàn trước khi ghi đè.

### 1.7. Kiến trúc Runtime & OBS Stage (P1 - P4)
- **Hiện trạng:** GameEngine chạy trực tiếp trên trình duyệt thông qua `window.setInterval` và `requestAnimationFrame`, lưu vào `LocalStorage`. Nếu mở 2 tab (Dashboard và OBS Browser Source), mỗi tab sẽ chạy một thế giới riêng biệt.
- **Hướng khắc phục:**
  - Tách rời hoàn toàn `GameEngine` khỏi `window`/`localStorage` thông qua Dependency Injection.
  - Xây dựng **Local Node.js Game Server** (`127.0.0.1`) làm Single Source of Truth với HTTP API + WebSocket Realtime Sync và lưu trữ file JSON bền vững trên đĩa (có backup).
  - Cung cấp 2 giao diện đồng bộ thời gian thực với cùng 1 server:
    - **Operator Dashboard (`/`)**: Quản lý thành phố, điều phối biểu quyết, giả lập comment, theo dõi kết nối.
    - **OBS Stage (`/stage`)**: Sân khấu độc lập chuẩn 9:16 (`1080x1920`), không có thanh điều khiển quản trị, tự động kết nối WebSocket tới Game Server.

---

## 2. LỘ TRÌNH TRIỂN KHAI & CHECKPOINT

1. **Giai đoạn P0:** Sửa toàn bộ lỗi nền tảng (WorldState notification, Citizen cargo & FSM, Pathfinding Octile & obstacle check, CommandParser false-positive & RateLimiter GC, BuildingSystem collision & level check, Persistence v2 & migration) + Unit tests + Commit & Push.
2. **Giai đoạn P1:** Tách headless GameEngine, xây dựng Local Game Server (HTTP + WebSocket trên `127.0.0.1`), đồng bộ trạng thái giữa Dashboard (`/`) và OBS Stage (`/stage`) + Tests + Commit & Push.
3. **Giai đoạn P2:** Mở rộng chiều sâu Gameplay (Giới hạn cư dân & chế độ nghỉ, Kinh tế Thực phẩm & Vàng, Fog of War thực sự cho lệnh `KHÁM PHÁ`, Hệ thống Biểu quyết dự án xây dựng `VOTE`, Sự kiện thành phố) + Tests + Commit & Push.
4. **Giai đoạn P3:** Kiến trúc Live Event Adapter (DI, Connection State Machine, chuẩn hóa Comment/Gift/Like, Adapter livestream cô lập & trung thực trạng thái) + Tests + Commit & Push.
5. **Giai đoạn P4:** Tối ưu hóa PixiJS 8 Renderer (Depth sorting thống nhất, dirty flags, dùng chung `TextStyle`, dọn dẹp listener, hiệu ứng khai thác/xây dựng/sương mù, giới hạn entity render) + Commit & Push.
6. **Giai đoạn P5:** Hoàn thiện bộ kiểm thử toàn diện, CI workflow (`.github/workflows/ci.yml`), tài liệu vận hành (`ARCHITECTURE.md`, `DATA_FLOW.md`, `GAMEPLAY.md`, `LOCAL_STREAM_SETUP.md`, `SECURITY.md`, `README.md`) + Final Verification & Push.
