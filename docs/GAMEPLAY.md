# LIVE CITY — TÀI LIỆU THIẾT KẾ GAMEPLAY (`GAMEPLAY.md`)

Tài liệu này mô tả toàn bộ cơ chế gameplay, kinh tế, bản đồ sương mù, hệ thống biểu quyết và sự kiện thành phố của **LIVE CITY**.

---

## 1. HỆ THỐNG CƯ DÂN (CITIZEN SYSTEM)

- **Định danh bền vững:** Mỗi người xem livestream sở hữu một cư dân riêng gắn với `userId`, có tên hiển thị, màu áo đặc trưng và bảng thống kê đóng góp lâu dài (`woodHarvested`, `stoneHarvested`, `foodHarvested`, `goldEarned`, `buildingsContributed`, `explorationPoints`).
- **Bảo toàn Cargo & Hàng đợi nhiệm vụ (`queuedTask`):**
  - Khi cư dân đang vác tài nguyên về kho (`carrying_resource`), nếu người chơi gửi lệnh mới (`XÂY`, `KHÁM PHÁ`, `ĐÁ`...), cư dân **không bao giờ đánh rơi hay mất số tài nguyên đang mang**.
  - Lệnh mới được lưu vào `queuedTask` cá nhân và tự động thực thi ngay khi cư dân nộp xong tài nguyên vào kho trung tâm.
- **Giới hạn hiển thị & Cơ chế nghỉ ngơi (`activeCitizensCap` & `isResting`):**
  - Mặc định thành phố duy trì tối đa `40` cư dân hoạt động đồng thời trên bản đồ (có thể nâng cấp lên cao hơn bằng cách xây thêm *Nhà Gỗ Ấm Cúng*).
  - Cư dân đứng yên không tương tác quá 3 phút hoặc vượt ngưỡng hiển thị sẽ tự động chuyển sang trạng thái nghỉ ngơi (`isResting = true`) để bảo vệ FPS cho OBS, và lập tức thức dậy ngay khi người xem bình luận trở lại.

---

## 2. HỆ THỐNG TÀI NGUYÊN VÀ KINH TẾ 4 TRỤ CỘT

1. **Gỗ (`Wood` 🪵):** Khai thác từ rừng sồi, rừng thông. Dùng làm vật liệu chính để dựng công trình hoặc đổi lấy Vàng.
2. **Đá (`Stone` 🪨):** Khai thác từ mỏ đá hoa cương, thạch anh, hắc diện thạch. Dùng để xây các công trình kiên cố, tháp canh và kho lớn.
3. **Thực phẩm (`Food` 🌾):**
   - Khai thác từ *Vườn Quả Mọng*, *Ốc Đảo Trái Cây* (lệnh `LƯƠNG THỰC` / `FOOD` / `HÁI QUẢ`) hoặc sản xuất tự động từ *Nông Trại & Lò Bánh Mì* (+15 Thực phẩm/phút).
   - Cư dân đang làm việc tiêu thụ một lượng nhỏ lương thực mỗi chu kỳ kinh tế (15 giây) để duy trì sức bền.
4. **Vàng (`Gold` 🪙):**
   - Thu được từ việc khám phá vùng đất mới, khai thác *Mạch Vàng Cổ Đại*, thu nhập thụ động từ *Thương Hội Trung Tâm* (+10 Vàng/phút) hoặc giao thương đổi Gỗ/Đá/Thực phẩm lấy Vàng (lệnh `ĐỔI VÀNG` / `TRADE`).

---

## 3. CÔNG TRÌNH VÀ BONUS THỰC TẾ

| Công trình | Cấp mở khóa | Chi phí | Hiệu ứng / Bonus thực tế |
| :--- | :---: | :--- | :--- |
| **Tòa Thị Chính** | Cấp 1 | Khởi đầu | Trung tâm tiếp nhận tài nguyên và quản lý thành phố. |
| **Tháp Canh Hoàng Hôn** | Cấp 1 | 50 Gỗ, 30 Đá | Mở rộng bán kính tầm nhìn Fog of War quanh tháp khi hoàn tất. |
| **Nhà Gỗ Ấm Cúng** | Cấp 1 | 60 Gỗ, 20 Đá | Tăng giới hạn cư dân hoạt động (+15) và +10% tốc độ di chuyển. |
| **Nông Trại & Lò Bánh Mì** | Cấp 1 | 70 Gỗ, 40 Đá | Tự động sản xuất +15 Thực phẩm mỗi phút. |
| **Kho Thóc Lớn** | Cấp 2 | 100 Gỗ, 80 Đá | Tăng sức chứa tối đa của kho Gỗ, Đá, Thực phẩm thêm +500. |
| **Xưởng Cưa Rừng Rậm** | Cấp 2 | 120 Gỗ, 60 Đá | Tăng +25% sản lượng thu hoạch Gỗ cho toàn bộ cư dân. |
| **Thương Hội Trung Tâm** | Cấp 2 | 110 Gỗ, 90 Đá | Tự động tạo +10 Vàng/phút và tăng +25% tỷ giá khi giao thương đổi Vàng. |
| **Khu Đẽo Đá Hoàng Gia** | Cấp 3 | 150 Gỗ, 150 Đá | Tăng +25% sản lượng khai thác Đá cho toàn bộ cư dân. |

---

## 4. BẢN ĐỒ SƯƠNG MÙ (FOG OF WAR) & KHÁM PHÁ THỰC

- Khi khởi đầu, chỉ vùng trung tâm quanh Tòa Thị Chính được mở sáng (`tile.discovered = true`). Các vùng biên giới bị bao phủ bởi lớp sương mù tối (`tile.discovered = false`).
- Khi người xem gõ **`KHÁM PHÁ`** (hoặc `!explore`, `thám hiểm`), cư dân sẽ tìm đường A* tiến về rìa vùng chưa mở.
- Khi di chuyển tới vùng mù, cư dân **mở sáng thật các ô địa hình trên bản đồ**, cập nhật tỷ lệ `% Mở đất` dựa trên số ô thực tế đã khám phá, đồng thời phát hiện các **Mỏ tài nguyên ẩn** (*Đại Thụ Ngàn Năm*, *Mỏ Hắc Diện Thạch*, *Mạch Vàng Cổ Đại*, *Ốc Đảo Trái Cây*).

---

## 5. BIỂU QUYẾT CỘNG ĐỒNG (COMMUNITY VOTING)

- Người vận hành có thể mở phiên bình chọn công trình tiếp theo (mặc định 90 giây).
- Trên màn hình OBS Stage hiển thị trực tiếp các ứng viên (`VOTE 1`, `VOTE 2`, `VOTE 3`) kèm số phiếu hiện tại.
- Khán giả bình luận **`VOTE 1`**, **`VOTE 2`**, **`VOTE 3`** (hoặc `BÌNH CHỌN 1`, `BẦU 2`).
- **Quy tắc công bằng:** Mỗi `userId` chỉ có duy nhất **1 phiếu hợp lệ** trong một phiên bình chọn.
- Khi hết giờ hoặc khi Operator chốt phiếu, công trình thắng cuộc được lưu vào lịch sử biểu quyết và tự động khởi công nếu kho đủ tài nguyên.

---

## 6. SỰ KIỆN THÀNH PHỐ (CITY EVENTS)

- **Lễ Hội Mùa Gặt (`harvest_festival`):** +50% sản lượng khai thác, +20% tốc độ di chuyển.
- **Ngày Hội Kiến Thiết (`builders_day`):** Tốc độ xây dựng công trình tăng gấp đôi (x2).
- **Cơn Mưa Rào Mùa Hạ (`rain_storm`):** Tốc độ di chuyển giảm 15% nhưng sản lượng gỗ tăng +30%.
- **Khám Phá Kho Báu Cổ (`treasure_hunt`):** Thưởng ngay +30 Vàng, +40 EXP thành phố và +25% tốc độ.
- **Mạch Khoáng Sản Trù Phú (`resource_boom`):** Hồi phục ngay 100% trữ lượng cho toàn bộ mỏ tài nguyên trên bản đồ.
