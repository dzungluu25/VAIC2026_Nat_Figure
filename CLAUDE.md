# Hướng dẫn cho Claude Code

## Git

- **Không bao giờ thêm dòng `Co-Authored-By: Claude` vào commit message.** Không ghi Claude, Anthropic hay bất kỳ công cụ AI nào làm contributor. Tác giả commit chỉ là người dùng.
- Không thêm dòng "Generated with Claude Code" vào commit message hay mô tả pull request.

## Backend

```bash
cd backend
npm test          # Vitest
npm run typecheck # kiểm tra kiểu cả src, tests và scripts
npm run build     # dọn dist/ rồi tsc + tsc-alias
```

- Mọi biến môi trường phải đọc qua `src/config/env.ts`, không gọi `process.env` trực tiếp trong `src/services` hay `src/controllers`.
- Ghi log qua `createLogger(scope)` trong `src/services/observability/logger.ts`, không dùng `console.*`. Logger tự che PII; gọi `console` trực tiếp sẽ bỏ qua lớp bảo vệ đó. Ngoại lệ: `src/services/data/seed-db.ts` là script CLI cho người vận hành.
- `src/` chỉ chứa mã production. Script vận hành để trong `scripts/`, test để trong `tests/`.
- Dùng path alias `@/*` thay cho chuỗi `../../`.
