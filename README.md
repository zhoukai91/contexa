# 语境翻译平台(Contexa Platform)

Contexa（Core）
├─ app/          ← 前端页面（Next.js App Router）
├─ app/api/      ← Core API（Route Handlers）
├─ lib/db/       ← Prisma + SQLite

## 本地开发

1. 安装依赖：`pnpm install`
2. 初始化数据库：`pnpm db:setup`
3. 启动开发：`pnpm dev`

## 环境变量

必填：
- BASE_URL
- AUTH_SECRET（>= 16）
- DATABASE_URL 或 SQLITE_PATH

对接 Enhanced（可选）：
- ENHANCED_SERVICE_URL（Enhanced 服务地址）
- ENHANCED_CORE_SECRET（与 Enhanced 的 CORE_SHARED_SECRET 保持一致）
- CORE_INSTANCE_ID（可选；不填会写入 system_meta 生成并持久化）

心跳与定时任务（可选）：
- CRON_SECRET（配置后 /api/cron/heartbeat 需要携带 x-cron-secret）

## 调试与回归

- `pnpm test:api`：启动临时 dev server 并回归 /api/me/password
