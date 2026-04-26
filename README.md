# 餐厅管理系统 (Next.js + SQLite / PostgreSQL 准备中)

当前仓库包含：
- 餐厅管理主系统
- `V3-lite` 食谱系统
- `L0-L6` 知识引擎相关能力

## 启动
1. 安装 Node.js 20+
2. 安装依赖：`npm install`
3. 复制环境模板：`cp .env.example .env.local`
4. 运行部署自检：`npm run deploy:check`
5. 启动开发：`npm run dev`
6. 打开：
   - `http://localhost:3000/order`
   - `http://localhost:3000/dashboard`
   - `http://localhost:3000/docs`
   - `http://localhost:3000/recipes`

## 运行时状态

查看：
- `GET /api/runtime/status`

关键返回：
- `recipe_store.mode = persistent`
  - 可用于真实草稿、审批、发布
- `recipe_store.mode = ephemeral`
  - 只适合 UI 和解析预览
- `postgres.configured = true`
  - 说明已配置 Postgres 连接变量
  - 当前仓库已补迁移骨架，但业务查询层仍在逐步从 SQLite 迁往 Postgres

当前部署约束：
- `Vercel + SQLite` 默认是临时库
- `Render + persistent disk` 可以作为正式可运营环境
- `Vercel + Postgres` 是下一阶段正式线上方案
- 后续如果迁到 `Bangwagon / VPS`，建议继续复用同一套 Postgres，不再回退到 SQLite

## 多端口预留
- 默认前后端同端口。
- 可通过 `NEXT_PUBLIC_API_BASE_URL` 指向独立 API 服务（如 `http://localhost:3001`）。
- 预留端口配置在 `lib/config.ts`。

## Qwen API Key 配置（必须）
1. 本地开发
   - 复制模板：`cp .env.example .env.local`
   - 在 `.env.local` 中填写真实 key（推荐字段：`DASHSCOPE_API_KEY`）
2. Vercel 预览/线上
   - 添加变量：`vercel env add DASHSCOPE_API_KEY`
   - 重新部署：`vercel --yes`

支持任一变量名：`DASHSCOPE_API_KEY`、`DASHSCOPE_APIKEY`、`QWEN_API_KEY`。

## MCP 聊天配置
聊天页入口：
- `http://localhost:3000/chatbot`

新增环境变量：
- `MCP_SERVER_COMMAND`
- `MCP_SERVER_ARGS`，推荐 JSON 数组字符串
- `MCP_SERVER_CWD`
- `MCP_PROTOCOL_VERSION`
- `MCP_CHAT_TOOL`
- `MCP_MULTI_AGENT_TOOL`
- `CHAT_MODE`

默认建议：
- `CHAT_MODE=single`
- `MCP_CHAT_TOOL=chat`

当前项目的 MCP 约定：
- Next.js 服务端会通过 `stdio` 启动外部 MCP server
- 聊天接口会调用配置好的 MCP tool
- 传给 tool 的参数为 `query`、`conversationId`、`messages`、`mode`
- tool 返回推荐格式：
  - `structuredContent.answer`
  - 可选 `structuredContent.conversationId`
  - 可选 `structuredContent.agents`
  - 或直接返回文本内容

## 持久化部署

推荐：
- 使用 [render.yaml](/Users/jeff/Documents/New%20project/render.yaml) 部署到 Render
- 数据目录挂载到 `/var/data`

如果走 `Vercel + Postgres`：
- 先在 Vercel Marketplace 创建 Postgres
- 配置 `POSTGRES_URL`（或兼容 `DATABASE_URL`）
- 执行 `npm run postgres:migrate`
- 再把业务存储层逐步切换到 Postgres

部署说明：
- [RENDER_DEPLOY_PLAN.md](/Users/jeff/Documents/New%20project/RENDER_DEPLOY_PLAN.md)
- [RENDER_GO_LIVE_CHECKLIST.md](/Users/jeff/Documents/New%20project/RENDER_GO_LIVE_CHECKLIST.md)

## API
- `POST /api/order`
- `GET /api/order?date=YYYY-MM-DD`
- `DELETE /api/order/:id`
- `GET /api/stations`
- `GET /api/suppliers`

### 食谱系统 API（新增）
- `GET /api/recipe-users`
- `GET /api/recipes`
- `POST /api/recipes`
- `GET /api/recipes/:id`
- `POST /api/recipes/:id/revision`
- `PATCH /api/recipes/versions/:versionId`
- `POST /api/recipes/versions/:versionId/submit`
- `POST /api/recipes/versions/:versionId/review`
- `POST /api/recipes/versions/:versionId/publish`
- `GET /api/recipes/approvals`

### bangwagong 对接（新增）
发布食谱版本时会尝试 webhook 同步到 bangwagong。请在环境变量中配置：
- `BANGWAGONG_WEBHOOK_URL`：你的 bangwagong webhook 地址
- `BANGWAGONG_API_TOKEN`：可选，Bearer Token
- `BANGWAGONG_WEBHOOK_TOKEN`：兼容别名，二选一即可

前端入口：
- `http://localhost:3000/recipes`
- `http://localhost:3000/recipes/approvals`

食谱分类模型：
- `BACKBONE`：基础母配方（跨菜单长期复用）
- `MENU`：季度菜单食谱（创建时建议填写 `menu_cycle`，如 `2026Q2`）

食谱 JSON（V3-lite）：
- `ELEMENT`：
  - `meta`：`dish_code`、`dish_name`、`display_name`、`aliases`、`entity_kind`、`business_type`、`technique_family`、`menu_cycle`、`plating_image_url`
  - `production`：`yield`、`net_yield_rate`、`key_temperature_points[]`
  - `allergens` / `diet_flags`
  - `ingredients[]`
  - `steps[]`
  - `component_refs[]`
- `COMPOSITE`：
  - `meta`
  - `production.serves`
  - `assembly_components[]`
  - `assembly_steps[]`

提交审批前会做结构校验。
Schema 文件：
- [schemas/element-record-v3-lite.schema.json](/Users/jeff/Documents/New%20project/schemas/element-record-v3-lite.schema.json)
- [schemas/composite-record-v3-lite.schema.json](/Users/jeff/Documents/New%20project/schemas/composite-record-v3-lite.schema.json)

## 数据库

默认：
- 食谱系统：`data/app.db`
- L0 引擎：`data/l0_engine.db`

可通过环境变量改写：
- `DATA_DIR`
- `RECIPES_DB_FILE`
- `L0_DB_FILE`
- `RECIPES_DB_PROVIDER`
- `POSTGRES_URL`
- `DATABASE_URL`

## 食评采集与分类导出
- 脚本：`scripts/food-review-collector.mjs`
- 运行默认采集：`npm run collect:food-reviews`
- 自定义参数示例：
  - `node scripts/food-review-collector.mjs --pages 2 --max-per-query 12 --output output/food_reviews.md`

参数说明：
- `--engine`：搜索引擎（当前默认 `google`，若超时会自动回退到 `bing`）
- `--pages`：每个查询抓取的搜索结果页数（默认 `2`）
- `--max-per-query`：每页最多解析条目数（默认 `10`）
- `--output`：输出 Markdown 文件路径（默认 `output/food_reviews.md`）
- `--delay-ms`：每次请求后的等待毫秒数（默认 `600`）

## YouTube 高相关视频转文案
- 脚本：`scripts/youtube_review_transcriber.py`
- 运行示例：
  - `npm run collect:youtube-transcripts -- --query "michelin fine dining review" --max-videos 6`
  - `npm run collect:youtube-transcripts -- --query "michelin fine dining review" --keywords "michelin,fine dining,restaurant review,tasting menu" --strict-relevance --min-score 3 --max-videos 8`
  - `python3 scripts/youtube_review_transcriber.py --query "亚洲 探店 食评" --keywords "探店,食评,餐厅,美食,vlog,review" --output output/youtube_food_transcripts.md`
  - `python3 scripts/youtube_review_transcriber.py --query "占位查询" --video-url "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --video-url "https://www.youtube.com/watch?v=jNQXAC9IVRw"`
  - `python3 scripts/youtube_review_transcriber.py --query "占位查询" --playlist-url "https://www.youtube.com/watch?v=xxx&list=PLAYLIST_ID" --max-videos 200`

参数说明：
- `--query`：YouTube 搜索词（必填）
- `--keywords`：相关性关键词（逗号分隔，用于打分排序）
- `--max-videos`：输出的视频数量上限（默认 `8`）
- `--feed-limit`：参与打分的候选视频上限（默认 `30`）
- `--min-score`：最低相关性分数（默认 `2`）
- `--negative-keywords`：负向关键词（命中会降分，默认含 `trailer,music,reaction...`）
- `--strict-relevance`：开启严格相关模式（至少命中 2 个正向关键词且不能命中强噪音）
- `--prefer-lang`：字幕语言优先级（默认 `zh-Hans,zh,en`）
- `--output`：输出 Markdown 路径（默认 `output/youtube_food_transcripts.md`）
- `--video-url`：直接指定视频链接（可重复传多次，传入后会跳过搜索）
- `--playlist-url`：直接指定播放列表链接（可重复传多次，自动展开整列表）

## 项目情况书 / Handover / 待办追踪
- 目录：`handover/`
- 固定入口（给新 AI 的唯一链接）：`handover/LIVE_CONTEXT.md`
- 每日创建交接文件：`npm run status:daily`
- 记录事件与改动：
  - `npm run status:event -- --what "今天发生了什么" --change "改了哪些内容"`
- 新增待办：`npm run status:todo:add -- --task "需要做的事情"`
- 标记完成：`npm run status:todo:done -- --id 1`
- 会话开始：
  - `npm run status:session:start -- --goal "本次目标" --plan "执行计划"`
- 会话结束（自动生成 Markdown 报告 + 可直接更新待办）：
  - `npm run status:session:end -- --summary "会话总结" --done "完成A|完成B" --pending "未完成A" --next "下一步A|下一步B" --done-id "1,2" --todo "新增待办A|新增待办B"`
- 文档完整性检查：
  - `npm run status:check`
- 生成可分享链接（LIVE_CONTEXT）：
  - `npm run status:link`
- 提交并推送到 GitHub：
  - `npm run status:push -- --message "chore(handover): daily update"`

建议每个 AI 会话结束都执行一次 `status:session:end` 并 `status:push`，避免跨会话信息丢失。
