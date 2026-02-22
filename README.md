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
