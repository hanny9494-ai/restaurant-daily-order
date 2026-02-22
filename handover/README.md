# AI 交接协议（防信息丢失）

目标：你可以把一个固定链接发给任何新会话 AI，它读完即可接力，不依赖上一个对话窗口。

## 固定入口（唯一链接）
- 本地：`handover/LIVE_CONTEXT.md`
- GitHub（示例）：`https://github.com/<owner>/<repo>/blob/<branch>/handover/LIVE_CONTEXT.md`

新对话只需要一句话：
- "请先阅读 handover/LIVE_CONTEXT.md，再开始执行。"

## 目录
- `LIVE_CONTEXT.md`：唯一入口（自动更新）
- `HANDOVER_COMPLETE_FRAMEWORK.md`：唯一长期主档（完整框架）
- `PROJECT_STATUS.md`：轻量状态看板
- `TODO.md`：进行中 / 已完成
- `CHANGELOG.md`：关键时间线
- `daily/YYYY-MM-DD.md`：当天 handover
- `sessions/YYYY-MM-DD_HHMM.md`：每次会话的结束报告
- `AI_SESSION_PROMPT.md`：新会话标准 prompt

## 会话标准流程
1. 开始会话：
   - `npm run status:session:start -- --goal "本次目标" --plan "执行计划"`
2. 中途记录事件（可选）：
   - `npm run status:event -- --what "发生了什么" --change "改动内容"`
3. 结束会话（必须）：
   - `npm run status:session:end -- --summary "会话总结" --done "完成A|完成B" --pending "未完成A" --next "下一步A|下一步B" --done-id "1,2" --todo "新增待办A|新增待办B"`
4. 生成可分享链接（给新 AI）：
   - `npm run status:link`
5. 运行文档检查（必须通过）：
   - `npm run status:check`
6. 推送到 GitHub：
   - `npm run status:push -- --message "chore(handover): session update"`

## 说明
- `session-end` 会自动生成 Markdown 会话报告。
- `session-end` 支持在结束时直接更新待办：
  - `--done-id`：将已有待办标记完成（逗号分隔）
  - `--todo`：新增待办（用 `|` 分隔）
- `LIVE_CONTEXT.md` 会自动刷新最近会话列表，保证入口始终最新。
- 规范要求：会话结束前 `status:check` 必须无 ERROR。
