# LIVE CITY — SƠ ĐỒ LUỒNG DỮ LIỆU (DATA FLOW SPECIFICATION)
## Phase 00: Foundation & Project Engineering

Tài liệu này minh họa các luồng dữ liệu chính trong trò chơi LIVE CITY.

---

## 1. LUỒNG XỬ LÝ LỆNH TỪ BÌNH LUẬN KHÁN GIẢ (COMMENT PIPELINE)

```mermaid
sequenceDiagram
    autonumber
    actor Viewer as Khán giả / Bot
    participant Adapter as MockLiveAdapter
    participant Dedupe as Deduplicator
    participant Parser as CommandParser
    participant Limiter as RateLimiter
    participant Dispatcher as CommandDispatcher
    participant CitizenSys as CitizenSystem
    participant State as WorldState
    participant Renderer as PixiWorldRenderer
    participant UI as Stream Stage & HUD

    Viewer->>Adapter: Gửi bình luận ("GỖ", "XÂY", "!vao", ...)
    Adapter->>Dispatcher: Chuyển giao RawLiveComment(id, userId, comment)
    Dispatcher->>Dedupe: isUnique(comment.id)
    alt Trùng lặp event
        Dedupe-->>Dispatcher: false
        Dispatcher-->>UI: Bỏ qua (ignored_duplicate)
    else Event mới
        Dedupe-->>Dispatcher: true
        Dispatcher->>Parser: parse(rawComment)
        alt Sai cú pháp
            Parser-->>Dispatcher: null
            Dispatcher->>State: pushEvent("command_rejected", "Lệnh không hợp lệ")
        else Lệnh hợp lệ
            Parser-->>Dispatcher: ParsedCommand(action, userId)
            Dispatcher->>Limiter: checkAndRecord(userId)
            alt Bị giới hạn tốc độ (Cooldown)
                Limiter-->>Dispatcher: { allowed: false, remainingMs }
                Dispatcher->>State: pushEvent("command_rejected", "Chờ cooldown")
            else Cho phép
                Limiter-->>Dispatcher: { allowed: true }
                Dispatcher->>CitizenSys: Điều phối lệnh (JOIN / HARVEST / BUILD / EXPLORE)
                CitizenSys->>State: Cập nhật mục tiêu, đường đi A* & trạng thái
                State->>Renderer: Đồng bộ thực thể & hoạt ảnh
                State->>UI: Kích hoạt Notify Subscriber cập nhật HUD
            end
        end
    end
```

---

## 2. VÒNG LẶP CHÍNH CỦA GAME ENGINE (GAME TICK LOOP)

```mermaid
flowchart TD
    A[Tick Engine: requestAnimationFrame] --> B[Tính Delta Time]
    B --> C[Cập nhật chu kỳ Ngày/Đêm]
    C --> D[CitizenSystem.update: Di chuyển A* & Máy trạng thái]
    D --> E[ResourceSystem.update: Hồi sinh mỏ cạn kiệt]
    E --> F[BuildingSystem.update: Quản lý công trường]
    F --> G[Kiểm tra Auto-save định kỳ 30s]
    G --> H[WorldState.notify: Cập nhật Observers]
    H --> I[PixiWorldRenderer: Render Frame Đồ họa Isometric]
    H --> J[React HUD: Cập nhật số liệu tài nguyên & Ticker]
    I --> A
```

---

## 3. LUỒNG TƯƠNG TÁC ĐÓNG GÓP XÂY DỰNG NHIỀU NGƯỜI (COLLABORATIVE BUILDING)

```mermaid
sequenceDiagram
    autonumber
    actor UserA as Cư dân A
    actor UserB as Cư dân B
    participant System as CitizenSystem
    participant State as WorldState
    participant Audio as AudioSystem
    participant Stage as Stream View

    Note over UserA,UserB: Cả 2 cùng gõ lệnh "XÂY"
    UserA->>System: assignBuild(cư dân A)
    UserB->>System: assignBuild(cư dân B)
    System->>State: Tìm công trình [Tháp Canh Hoàng Hôn]
    System-->>Stage: 2 cư dân di chuyển đến công trường (A* Pathfinding)
    
    loop Mỗi chu kỳ xây dựng
        System->>State: applyBuildProgress(+5 pt, UserA)
        System->>Audio: playBuildSound()
        System->>State: applyBuildProgress(+5 pt, UserB)
        System->>Audio: playBuildSound()
        State-->>Stage: Thanh tiến độ xây dựng tăng dần trên màn hình
    end

    alt Tiến độ đạt 100%
        State->>State: Chuyển trạng thái sang "ACTIVE"
        State->>Audio: playCompleteSound()
        State->>Stage: Bắn pháo hoa ăn mừng & cộng EXP thành phố
    end
```
