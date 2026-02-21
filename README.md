# 极简餐厅每日下货工具 (Next.js + SQLite)

## 启动
1. 安装 Node.js 18+
2. 安装依赖：`npm install`
3. 启动开发：`npm run dev`
4. 打开：
   - `http://localhost:3000/order`
   - `http://localhost:3000/dashboard`

## 多端口预留
- 默认前后端同端口。
- 可通过 `NEXT_PUBLIC_API_BASE_URL` 指向独立 API 服务（如 `http://localhost:3001`）。
- 预留端口配置在 `lib/config.ts`。

## API
- `POST /api/order`
- `GET /api/order?date=YYYY-MM-DD`
- `DELETE /api/order/:id`
- `GET /api/stations`
- `GET /api/suppliers`

## 数据库
SQLite 文件：`data/app.db`
