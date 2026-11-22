# LIVE CITY — HƯỚNG DẪN THIẾT LẬP LIVESTREAM & OBS (`LOCAL_STREAM_SETUP.md`)

Tài liệu này hướng dẫn chi tiết cách vận hành **LIVE CITY** trên máy tính của Streamer cùng phần mềm **OBS Studio** hoặc **TikTok LIVE Studio**.

---

## 1. KHỞI CHẠY LOCAL GAME SERVER & FRONTEND

Tại thư mục gốc của dự án, mở terminal và chạy:

```bash
npm install
npm run dev
```

*(Hoặc chạy bản Production đã tối ưu hóa)*:

```bash
npm run build
npm run preview
```

Khi máy chủ khởi chạy, toàn bộ dịch vụ chỉ lắng nghe an toàn trên địa chỉ cục bộ `127.0.0.1`:
- **Operator Dashboard (Màn hình điều khiển của Streamer):**
  - Dev mode: `http://127.0.0.1:3000/`
  - Preview mode: `http://127.0.0.1:4173/`
- **OBS Stage (Màn hình sân khấu độc lập cho khán giả):**
  - Dev mode: `http://127.0.0.1:3000/stage`
  - Preview mode: `http://127.0.0.1:4173/stage`
  - Chế độ nền trong suốt (Transparent Overlay): `http://127.0.0.1:3000/stage?bg=transparent`

---

## 2. CẤU HÌNH OBS BROWSER SOURCE CHUẨN 9:16 (1080 × 1920)

1. Mở **OBS Studio** (hoặc TikTok LIVE Studio).
2. Trong mục **Settings > Video**, đặt kích thước khung hình dọc livestream:
   - **Base (Canvas) Resolution:** `1080x1920`
   - **Output (Scaled) Resolution:** `1080x1920`
   - **FPS:** `60` (hoặc `30`)
3. Trong mục **Sources**, nhấn dấu **`+`** ➔ Chọn **Browser** (Nguồn trình duyệt) ➔ Đặt tên là `LIVE CITY STAGE`.
4. Nhập các thông số sau:
   - **URL:** `http://127.0.0.1:3000/stage` *(hoặc `http://127.0.0.1:4173/stage` nếu chạy preview)*
   - **Width:** `1080`
   - **Height:** `1920`
   - **Use custom frame rate:** Bật và đặt `60` FPS.
   - **Shutdown source when not visible:** Tắt (Không tích) để giữ kết nối WebSocket liên tục khi chuyển cảnh.
5. Nhấn **OK**.

---

## 3. KIỂM TRA ĐỒNG BỘ GIỮA DASHBOARD VÀ OBS STAGE

1. Mở trình duyệt thông thường truy cập **Operator Dashboard**: `http://127.0.0.1:3000/`.
2. Kiểm tra nhãn trạng thái trên thanh Header hiển thị: **`Local Server Synced (127.0.0.1)`** màu xanh lá.
3. Trong bảng **Mô phỏng tương tác livestream**, nhấn nút **`VÀO`** hoặc **`GỖ`** (hoặc bật **`Chạy Bot Khán Giả`**).
4. Quan sát trên cửa sổ **OBS Studio (`/stage`)**: Cư dân sẽ xuất hiện và di chuyển ngay lập tức trên cả 2 màn hình mà không có độ trễ hay sai lệch trạng thái.

---

## 4. KẾT NỐI NGUỒN SỰ KIỆN LIVESTREAM (LIVE ADAPTER)

Trong Operator Dashboard ➔ Tab **`Live & OBS`**:
- **Chế độ Mock Simulator (Mặc định):** Dùng để kiểm thử gameplay, chạy bot tự động hoặc điều khiển trực tiếp trong các buổi thử nghiệm.
- **Chế độ TikTok LIVE Bridge / Webhook:**
  - Kiến trúc của LIVE CITY tách biệt hoàn toàn `TikTokLiveAdapter` khỏi `GameEngine`.
  - Vì TikTok không cung cấp API WebSocket mở trực tiếp cho trình duyệt không xác thực, bạn có thể chạy một dịch vụ Local Webcast Bridge trên máy và đẩy sự kiện vào endpoint `POST http://127.0.0.1:3000/api/live/webhook` (kèm header `x-operator-token`) hoặc kết nối qua `TIKTOK_BRIDGE_URL`.
  - Nếu chưa khởi chạy Bridge bên ngoài, giao diện sẽ hiển thị trung thực trạng thái **`ERROR / CHờ TÍCH HỢP BRIDGE`**, tuyệt đối không bao giờ giả lập trạng thái đã kết nối.

---

## 5. XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

- **OBS Browser Source hiển thị màn hình trắng hoặc không tải được:**
  - Đảm bảo lệnh `npm run dev` hoặc `npm run preview` đang chạy trong terminal.
  - Kiểm tra đúng địa chỉ `http://127.0.0.1:3000/stage` (dùng `127.0.0.1` thay vì IP mạng LAN vì server chỉ bind loopback để bảo mật).
  - Trong OBS, nhấp chuột phải vào nguồn `LIVE CITY STAGE` ➔ Chọn **Interact** hoặc mở Properties và nhấn **Refresh cache of current page**.
- **OBS bị giật hình (Stutter):**
  - Bật **Hardware Acceleration** cho Browser Source trong phần **Settings > Advanced > Sources > Enable Browser Source Hardware Acceleration** của OBS Studio.
