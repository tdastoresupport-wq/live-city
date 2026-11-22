# LIVE CITY — SƠ ĐỒ LUỒNG DỮ LIỆU (DATA FLOW SPECIFICATION)

Tài liệu này mô tả luồng dữ liệu thời gian thực giữa Khán giả Livestream, Local Game Server, Operator Dashboard (`/`) và OBS Stage (`/stage`).

---

## 1. LUỒNG ĐỒNG BỘ REALTIME GIỮA SERVER, DASHBOARD VÀ OBS STAGE

```mermaid
sequenceDiagram
    autonumber
    actor Viewer as Khán giả / Simulator
    participant Adapter as LiveAdapter (Mock / TikTok Bridge)
    participant Server as Local Game Server (127.0.0.1)
    participant Engine as Headless GameEngine
    participant Disk as FilePersistence (.data/)
    participant Dashboard as Operator Dashboard (/)
    participant OBS as OBS Stage (/stage)

    OBS->>Server: Kết nối WebSocket (ws://127.0.0.1/ws)
    Server-->>OBS: Gửi Initial Snapshot v2 + LiveConnectionState
    Dashboard->>Server: Kết nối WebSocket + Lấy Session Token (/api/auth/session)
    Server-->>Dashboard: Gửi Initial Snapshot v2 + Operator Token

    Viewer->>Adapter: Bình luận ("GỖ", "XÂY", "VOTE 1", "KHÁM PHÁ")
    Adapter->>Engine: Chuẩn hóa RawLiveComment (Chống Replay & Duplicate)
    Engine->>Engine: CommandParser ➔ RateLimiter (User + Global) ➔ Domain System
    Engine->>Server: WorldState.batch() hoàn tất ➔ Kích hoạt State Listener
    Server-->>OBS: Broadcast state_sync qua WebSocket
    Server-->>Dashboard: Broadcast state_sync qua WebSocket
    Engine->>Disk: Auto-save Snapshot v2 (kèm bản sao lưu .backup.json)
```

---

## 2. LUỒNG BẢO TOÀN CARGO VÀ HÀNG ĐỢI NHIỆM VỤ CƯ DÂN

```mermaid
stateDiagram-v2
    [*] --> idle: Gia nhập (VÀO)
    idle --> moving_to_harvest: Lệnh GỖ / ĐÁ / LƯƠNG THỰC
    moving_to_harvest --> harvesting: Tới mỏ tài nguyên
    harvesting --> carrying_resource: Thu hoạch xong (Có carriedResource)
    
    carrying_resource --> carrying_resource: Nhận lệnh mới (XÂY / KHÁM PHÁ) ➔ Lưu vào queuedTask (KHÔNG HỦY CARGO)
    carrying_resource --> idle: Tới kho ➔ Nộp tài nguyên vào WorldState
    
    idle --> moving_to_build: Tự động lấy queuedTask = build (hoặc lệnh XÂY)
    moving_to_build --> building: Tới công trường
    building --> idle: Công trình hoàn thành (100%)
    
    idle --> exploring: Tự động lấy queuedTask = explore (hoặc lệnh KHÁM PHÁ)
    exploring --> idle: Mở vùng Fog of War & phát hiện mỏ mới
```

---

## 3. LUỒNG BIỂU QUYẾT DỰ ÁN CỘNG ĐỒNG (COMMUNITY VOTING FLOW)

```mermaid
sequenceDiagram
    autonumber
    actor Operator as Người vận hành (Dashboard)
    actor Viewers as Khán giả Livestream
    participant Server as GameServer / BuildingSystem
    participant State as WorldState
    participant Stage as OBS Stage (/stage)

    Operator->>Server: POST /api/control/vote { action: "open", durationSeconds: 90 }
    Server->>State: Khởi tạo VotingSession với 3 công trình đã mở khóa
    State-->>Stage: Hiển thị bảng bình chọn (VOTE 1, VOTE 2, VOTE 3) trên HUD

    loop Trong thời gian mở bình chọn
        Viewers->>Server: Bình luận "VOTE 1", "BÌNH CHỌN 2"
        Server->>Server: Kiểm tra mỗi userId chỉ có 1 phiếu duy nhất
        Server->>State: Cộng phiếu & cập nhật tỷ lệ bình chọn trực tiếp
        State-->>Stage: Cập nhật số phiếu thời gian thực
    end

    alt Hết thời gian hoặc Operator bấm Chốt Phiếu
        Server->>State: Đóng phiên vote, lưu vào voteHistory, chọn công trình nhiều phiếu nhất
        Server->>State: Kiểm tra tài nguyên & vị trí ➔ Khởi công dự án thắng cuộc
        State-->>Stage: Hiển thị giàn giáo công trình mới để cư dân gõ XÂY
    end
```
