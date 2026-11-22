# LIVE CITY — CHÍNH SÁCH BẢO MẬT & AN TOÀN HỆ THỐNG (`SECURITY.md`)

Tài liệu này quy định các tiêu chuẩn bảo mật bắt buộc của **LIVE CITY** cho cả môi trường Local Runtime và Repository GitHub.

---

## 1. BẢO MẬT LOCAL GAME SERVER (`127.0.0.1`)

1. **Loopback Binding Mặc Định:**
   - Máy chủ Game Server và Vite Server mặc định chỉ bind vào địa chỉ loopback `127.0.0.1`.
   - Không mở cổng ra mạng LAN hay Internet công cộng mặc định, ngăn chặn các thiết bị khác trong cùng mạng Wi-Fi tự ý gửi lệnh điều khiển thành phố.
2. **Kiểm tra Origin Nghiêm Ngặt (Strict Origin Verification):**
   - Cả HTTP API (`/api/*`) và WebSocket (`/ws`) đều kiểm tra header `Origin` và địa chỉ IP kết nối (`127.0.0.1`, `localhost`, `::1`).
   - Tuyệt đối không sử dụng wildcard `Access-Control-Allow-Origin: *`. Mọi request từ trang web bên ngoài (Cross-Site WebSocket Hijacking / CSRF) đều bị từ chối với mã `403 Forbidden`.
3. **Cơ chế Xác thực Điều khiển (Operator Session Token):**
   - Khi khởi động, `GameServer` sinh một mã `operatorToken` ngẫu nhiên 24-byte bằng `node:crypto` (hoặc đọc từ biến môi trường `LIVE_CITY_OPERATOR_TOKEN` trên máy).
   - Mọi thao tác thay đổi trạng thái từ Dashboard (`POST /api/command`, `/api/control/reset`, `/api/control/project`, `/api/control/vote`, `/api/live/*`) đều bắt buộc gửi kèm header `x-operator-token` hợp lệ. Nếu thiếu hoặc sai token, server trả về `401 Unauthorized`.
   - Thao tác đặt lại thế giới (`/api/control/reset`) yêu cầu thêm mã xác nhận tường minh `{ "confirm": "RESET_LIVE_CITY" }`.

---

## 2. BẢO VỆ PIPELINE XỬ LÝ LỆNH LIVESTREAM

1. **Làm sạch & Giới hạn Dữ liệu Đầu vào (Input Sanitization):**
   - Loại bỏ toàn bộ ký tự điều khiển (`[\x00-\x1F\x7F]`).
   - Giới hạn độ dài bình luận tối đa `80` ký tự và tên người xem tối đa `36` ký tự.
   - Giới hạn kích thước gói tin HTTP/WebSocket tối đa `64 KB` để chống tấn công làm tràn bộ nhớ (Memory Exhaustion DoS).
2. **Chống Trùng lặp & Chống Phát lại (Anti-Replay & Deduplication):**
   - `Deduplicator` lưu vết ID sự kiện trong cửa sổ trượt TTL để loại bỏ các sự kiện gửi trùng.
   - `TikTokLiveAdapter` kiểm tra chênh lệch thời gian (`maxReplayAgeMs = 120s`), từ chối các gói tin cũ bị phát lại.
3. **Giới hạn Tốc độ Hai Tầng (Dual-Layer Rate Limiting):**
   - **Per-User Cooldown (1.5s):** Ngăn một cá nhân spam lệnh liên tục.
   - **Global Burst Limit (40 lệnh/giây) & Queue Overflow Protection:** Bảo vệ vòng lặp GameEngine không bị treo khi có hàng nghìn bình luận đổ về cùng một thời điểm, đồng thời tự động dọn dẹp (Garbage Collection) các bản ghi rate-limit cũ.

---

## 3. BẢO VỆ KHO MÃ NGUỒN VÀ DỮ LIỆU CÁ NHÂN

- **Tuyệt đối không lưu Secrets trong mã nguồn hoặc Frontend Bundle:**
  - Không bao giờ đưa API keys, cookies, session tokens, mật khẩu hoặc thông tin đăng nhập TikTok vào code hay commit lên GitHub.
  - `.gitignore` chặn hoàn toàn `.env`, `.env.*` (chỉ cho phép `.env.example`), thư mục dữ liệu `.data/` và các tệp log.
- **Xác thực Schema Snapshot trước khi nạp (`WorldState.isValidSnapshot`):**
  - Không tin tưởng mù quáng dữ liệu JSON đọc từ đĩa hoặc LocalStorage. Mọi trường số học, mảng cư dân, công trình và tài nguyên đều được kiểm tra kiểu và giới hạn không âm trước khi khôi phục, kèm cơ chế tự động phục hồi từ bản sao lưu `.backup.json` nếu file chính bị lỗi.
