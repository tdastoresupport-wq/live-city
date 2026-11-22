# LIVE CITY — AGENTS DEVELOPMENT & GITHUB SYNC POLICY

Tài liệu này là quy chuẩn bắt buộc cho mọi Agent và kỹ sư tham gia phát triển dự án **LIVE CITY**.

---

## 1. THÔNG TIN REPOSITORY CHÍNH THỨC

- **GitHub Repository:** https://github.com/zevxstore-crypto/live-city
- **Remote URL:** `https://github.com/zevxstore-crypto/live-city.git`
- **Default Branch:** `main`
- **Nguyên tắc tối thượng:** Mọi thay đổi mã nguồn có ý nghĩa đều phải được commit và push lên GitHub. Không được chỉ lưu thay đổi trên máy local rồi tuyên bố đã hoàn thành.

---

## 2. QUY TRÌNH BẮT BUỘC TRONG MỌI PHIÊN LÀM VIỆC

### Bước A — Khởi đầu phiên làm việc
1. Kiểm tra trạng thái Git (`git status`, `git branch`, `git remote -v`, `git log -1`).
2. Kiểm tra các thay đổi chưa commit trên local, bảo toàn mã nguồn hiện có của người dùng.
3. Đồng bộ với remote nếu có cập nhật mới (`git fetch`, `git pull origin main`).
4. Xác định đúng phạm vi và các file liên quan trước khi chỉnh sửa.

### Bước B — Trong quá trình phát triển (Làm đến đâu, push đến đó)
1. Chia nhỏ công việc thành các phần việc có ý nghĩa kỹ thuật rõ ràng.
2. Sau khi hoàn thành mỗi module hoặc logic con, tiến hành tạo checkpoint commit ngay.
3. Tuyệt đối không chờ đến khi hoàn thành toàn bộ dự án mới commit một lần.
4. Không để nhiều tính năng lớn bị dồn ứ trên local.

### Bước C — Trước khi commit
1. Kiểm tra danh sách file đã thay đổi (`git status`, `git diff`).
2. Tuyệt đối loại bỏ các file sinh tự động, file rác, file tạm.
3. **Bảo mật tuyệt đối:** Không bao giờ commit `.env`, token, mật khẩu, API keys, private keys hay dữ liệu cá nhân.
4. Chạy kiểm tra thực tế:
   - Typecheck & Build: `npm run build`
   - Unit tests: `npm test`
5. Chỉ commit khi các kiểm tra cần thiết đã chạy và vượt qua.

### Bước D — Commit và Push lên GitHub
1. Commit message chuẩn theo chuẩn **Conventional Commits**:
   - `feat: ...` (tính năng mới)
   - `fix: ...` (sửa lỗi)
   - `refactor: ...` (tái cấu trúc không đổi logic)
   - `test: ...` (bổ sung hoặc sửa test)
   - `docs: ...` (tài liệu kỹ thuật)
2. Push commit ngay lập tức lên remote branch `main`.
3. Nếu nhánh `main` bị bảo vệ (branch protection), tạo nhánh làm việc riêng (ví dụ `feature/...` hoặc `wip/...`) và push nhánh đó. Tuyệt đối không tìm cách bypass access control.
4. **Cấm kỵ:** Không dùng `git push --force`, không sửa lịch sử commit đã được chia sẻ công khai (`amend` hoặc `rebase` tùy tiện).

### Bước E — Xử lý khi có lỗi hoặc công việc chưa xong
- Nếu code chưa hoàn chỉnh hoặc test thất bại: Không push code lỗi lên `main` như thể đã xong. Tạo checkpoint commit trên branch `wip/<feature-name>`, push lên remote và ghi rõ trạng thái WIP cùng các bước tiếp theo.
- Nếu gặp lỗi push (mạng, quyền truy cập): Giữ nguyên mã nguồn local, báo cáo trung thực lỗi gặp phải, không xóa file để che giấu và không tuyên bố đã đồng bộ khi chưa thành công.

---

## 3. AN TOÀN REPOSITORY & .GITIGNORE

Duy trì `.gitignore` chuẩn. Không bao giờ commit:
- `node_modules/`, `dist/`, build artifacts.
- File môi trường: `.env`, `.env.local`, `.env.*`.
- Cache, log, file hệ điều hành (`.DS_Store`, `Thumbs.db`).
- Khóa bí mật hoặc thông tin định danh cá nhân.

---

## 4. QUY TRÌNH XÁC MINH PUSH (VERIFICATION)

Sau mỗi lần push:
1. Xác nhận lệnh `git push origin <branch>` trả về mã 0 (thành công).
2. Lấy commit SHA local: `git rev-parse HEAD`.
3. Kiểm tra remote commit SHA: `git ls-remote origin <branch>`.
4. So khớp 2 mã SHA để đảm bảo commit đã xuất hiện thực sự trên remote GitHub.

Báo cáo kết thúc phiên làm việc luôn phải có định dạng:

```text
GITHUB SYNC REPORT
- Branch: main
- Commit: <SHA>
- Commit message: <message>
- Files changed: <số lượng file>
- Tests: <kết quả chạy test>
- Build: <kết quả npm run build>
- Push status: SUCCESS
- Remote verification: SHA verified on remote (git ls-remote)
- Remaining issues: <nếu có>
```

**LOCAL CHANGES ≠ GITHUB BACKUP.** Luôn đảm bảo mã nguồn tồn tại bền vững trên GitHub!
