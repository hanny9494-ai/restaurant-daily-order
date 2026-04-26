# Vercel + Postgres 迁移方案

## 结论

当前仓库已经补了 `Vercel + Postgres` 的迁移骨架，但**还没有完成业务存储层切换**。

当前状态分三层：

1. `SQLite 主实现`
   - 现有业务逻辑仍然运行在 [lib/db.ts](/Users/jeff/Documents/New%20project/lib/db.ts)
   - 适合本地与 Render 持久磁盘

2. `Postgres 连接与 schema 骨架`
   - 已新增：
     - [lib/postgres.ts](/Users/jeff/Documents/New%20project/lib/postgres.ts)
     - [db/postgres/001_init.sql](/Users/jeff/Documents/New%20project/db/postgres/001_init.sql)
     - [scripts/postgres-migrate.mjs](/Users/jeff/Documents/New%20project/scripts/postgres-migrate.mjs)

3. `下一阶段`
   - 把同步 SQLite 查询层逐步迁到异步 Postgres Repository

## 为什么这样拆

原因很直接：

- 现有 [lib/db.ts](/Users/jeff/Documents/New%20project/lib/db.ts) 基于 `better-sqlite3`，是同步调用
- `pg` 是异步连接
- 如果直接强切，会影响：
  - 导入
  - 查看
  - 审批
  - 发布
  - FOH

所以当前最稳的路径是：

1. 先补连接和 schema
2. 再抽象 Repository 层
3. 最后切换 API

## 已新增的环境变量

- `RECIPES_DB_PROVIDER=sqlite|postgres`
- `POSTGRES_URL`
- `DATABASE_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `PG_POOL_MAX`

## Vercel 侧建议

1. 在 Vercel Marketplace 创建 Postgres
2. 确认项目环境变量里已经出现：
   - `POSTGRES_URL`
   - 或兼容的 `DATABASE_URL`
3. 本地执行：

```bash
npm run postgres:migrate
```

4. 再部署到 Vercel
5. 打开：

```text
/api/runtime/status
```

确认：
- `postgres.configured = true`

## 当前限制

即使 `postgres.configured = true`，也不代表业务查询已经全部切到 Postgres。

这一步只说明：
- 连接变量到位
- schema 可初始化
- 下一阶段可以开始逐步迁移查询层

## 下一阶段建议

1. 抽 `RecipeRepository`
2. 先迁移：
   - `recipes list/detail`
   - `import confirm`
   - `approvals`
3. 再迁移：
   - receiving
   - FOH
   - knowledge engine

## 后续迁到 Bangwagon 的路径

如果后面正式服务器改放到 Bangwagon / VPS，这套方案可以直接延续：

1. 应用层继续用当前 Next.js 项目
2. 数据层继续连同一个 Postgres
3. 先从 Vercel 切出 Web 层，再迁：
   - 域名
   - 反向代理
   - 进程守护（PM2 / systemd）
4. 数据库不需要再回退到 SQLite

这样迁移风险最低，因为：

- `Vercel -> Bangwagon` 只换应用托管位置
- `Postgres` 继续保持不变
- 业务数据不需要二次搬库
