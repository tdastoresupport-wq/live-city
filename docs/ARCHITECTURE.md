# LIVE CITY — KIẾN TRÚC KỸ THUẬT (ARCHITECTURE SPECIFICATION)
## Phase 00: Foundation & Project Engineering

Tài liệu này mô tả chi tiết kiến trúc của **LIVE CITY** — tựa game tương tác livestream mô phỏng thế giới ảo, nơi khán giả điều khiển cư dân, khai thác tài nguyên và cùng nhau xây dựng thành phố thông qua bình luận trực tiếp.

---

## 1. NGUYÊN TẮC THIẾT KẾ CỐT LÕI (CORE PRINCIPLES)

1. **Decoupled Game Engine & UI**:
   - Toàn bộ logic trò chơi (`WorldState`, `CitizenSystem`, `ResourceSystem`, `BuildingSystem`) hoàn toàn độc lập với React và PixiJS.
   - Trò chơi có thể chạy ở chế độ headless (không cần giao diện), phục vụ kiểm thử đơn vị hoặc chuyển đổi sang backend server trong tương lai mà không phải sửa logic game.

2. **Decoupled Live Event Adapter**:
   - `GameEngine` không phụ thuộc vào bất kỳ nhà cung cấp livestream cụ thể nào (TikTok Live, YouTube Live, Twitch).
   - Mọi luồng sự kiện bên ngoài đi qua interface trừu tượng `ILiveEventAdapter`.
   - Trong Phase 00, hệ thống sử dụng `MockLiveAdapter` hỗ trợ cả việc gõ lệnh thủ công lẫn chạy bot khán giả tự động với độ ngẫu nhiên thực tế.

3. **Bảo vệ bất biến (Invariant Protection)**:
   - Tài nguyên không bao giờ âm (`worldState.consumeResource` từ chối nếu không đủ tài nguyên).
   - Sức chứa kho được tôn trọng nghiêm ngặt (không vượt quá giới hạn lưu trữ tối đa).
   - Công trình chỉ chuyển sang trạng thái hoàn thành (`active`) khi điểm tiến độ đạt đủ `requiredProgress`.

4. **Chống Spam & Chống Trùng Lặp (Anti-spam & Idempotency)**:
   - **Deduplicator**: Bộ đệm trượt TTL (Time-To-Live) chặn các event trùng ID được gửi lại.
   - **RateLimiter**: Giới hạn tốc độ per-user (cooldown 1.5s) kèm thông báo trực quan tới người xem.

5. **Nghệ thuật Cozy Isometric Thuần Code (Zero Stock Assets)**:
   - Mọi gạch nền (cỏ, nước dập dềnh, đường đá, quảng trường), cây cối, tảng đá, công trình và nhân vật cư dân đều được render bằng thuật toán đồ họa vector/isometric PixiJS 2.5D.
   - Hiệu ứng âm thanh procedural tổng hợp trực tiếp bằng Web Audio API không phụ thuộc tệp âm thanh bên ngoài.

---

## 2. PHÂN TẦNG HỆ THỐNG (SYSTEM LAYERS)

```
┌───────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                        │
│  ┌─────────────────────────────┐ ┌──────────────────────────┐ │
│  │   StreamStage (1080x1920)   │ │  Comment Simulator & UI  │ │
│  │    PixiJS World Canvas      │ │  City Inspector & Ticker │ │
│  └──────────────┬──────────────┘ └─────────────┬────────────┘ │
└─────────────────┼──────────────────────────────┼──────────────┘
                  │ Observer / Reactive Subscribe│
┌─────────────────▼──────────────────────────────▼──────────────┐
│                    LIVE CITY CORE ENGINE                      │
│                                                               │
│   ┌────────────────────────────────────────────────────────┐  │
│   │                     Command Pipeline                   │  │
│   │ [LiveComment] ➔ [Deduplicator] ➔ [CommandParser] ➔      │  │
│   │               ➔ [RateLimiter] ➔ [CommandDispatcher]    │  │
│   └────────────────────────────┬───────────────────────────┘  │
│                                │                              │
│   ┌────────────────────────────▼───────────────────────────┐  │
│   │                      Domain Systems                    │  │
│   │  • CitizenSystem (A* Pathfinding & Task FSM)           │  │
│   │  • ResourceSystem (Node Regeneration & Depletion)      │  │
│   │  • BuildingSystem (Blueprints & Construction)          │  │
│   │  • AudioSystem (Web Audio API Procedural Synthesizer)  │  │
│   └────────────────────────────┬───────────────────────────┘  │
│                                │                              │
│   ┌────────────────────────────▼───────────────────────────┐  │
│   │                     WorldState                         │  │
│   │  • TileMap (22x22 Isometric Grid)                      │  │
│   │  • Resources & Caps                                    │  │
│   │  • Citizens Map & Event Log                            │  │
│   └────────────────────────────┬───────────────────────────┘  │
└────────────────────────────────┼──────────────────────────────┘
                                 │
┌────────────────────────────────▼──────────────────────────────┐
│                      ADAPTERS LAYER                           │
│   • MockLiveAdapter (Simulated comments & bot swarm)          │
│   • LocalStoragePersistence (Snapshots & World Recovery)      │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. CƠ CHẾ COMMAND VÀ TRẠNG THÁI CƯ DÂN (CITIZEN FSM)

Mỗi cư dân trong thành phố đại diện cho một người xem livestream và hoạt động như một máy trạng thái hữu hạn (Finite State Machine):

- **IDLE**: Cư dân đứng tại quảng trường trung tâm hoặc thỉnh thoảng đi dạo quanh thị trấn.
- **MOVING_TO_HARVEST**: Tính đường đi ngắn nhất (A*) tới mỏ gỗ hoặc mỏ đá gần nhất.
- **HARVESTING**: Đứng tại mỏ tài nguyên, đếm ngược chu kỳ khai thác và phát âm thanh đốn củi/đập đá.
- **CARRYING_RESOURCE**: Vác bao gỗ/đá trên lưng, tìm đường trở về Tòa Thị Chính hoặc Kho Thóc để nộp.
- **MOVING_TO_BUILD**: Di chuyển tới công trình đang trong dự án thi công.
- **BUILDING**: Gõ búa xây dựng, tăng điểm tiến độ công trình cho đến khi hoàn thành.
- **EXPLORING**: Tiến tới các vùng biên giới chưa khai phá, mở rộng tầm nhìn lãnh thổ và nhận điểm kinh nghiệm.

---

## 4. CHI TIẾT TỌA ĐỘ VÀ CHIẾU ISOMETRIC (ISOMETRIC PROJECTION)

- Tỷ lệ Isometric chuẩn: $2:1$ (Tile Width = 64px, Tile Height = 32px).
- Công thức chuyển đổi từ lưới thế giới $(x, y)$ sang màn hình $(sx, sy)$:
  $$sx = (x - y) \times \frac{\text{ISO\_TILE\_WIDTH}}{2}$$
  $$sy = (x + y) \times \frac{\text{ISO\_TILE\_HEIGHT}}{2}$$
- Sắp xếp độ sâu (Depth Sorting):
  $$\text{zIndex} = x + y$$
  Đảm bảo các thực thể ở phía trước luôn hiển thị đè lên các thực thể và địa hình ở phía sau một cách tự nhiên.
