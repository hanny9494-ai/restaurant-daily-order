# Session Handover - 2026-02-22 22:19:18

## 会话目标
- 将 Dify chatbot 接入网站并完成对外可用部署（优先 API 代理模式）。

## 已完成内容
- 网站端新增聊天入口与页面：
  - `/app/page.tsx` 增加 `Dify Chatbot` 入口按钮
  - `/app/chatbot/page.tsx` 改为自定义聊天 UI（调用站内 `/api/chat`）
- 新增后端代理接口：
  - `/app/api/chat/route.ts`
  - 功能：服务端调用 Dify `/v1/chat-messages`，前端不暴露 key
  - 已支持：SSE 解析、`workflow_finished` 回收答案、超时兜底
- 样式更新：
  - `/app/globals.css` 增加聊天界面样式
- 部署状态：
  - Vercel 已部署（历史）
  - Bandwagon 已部署并在线：`https://order.jify.com.cn`
  - Chat 页面：`https://order.jify.com.cn/chatbot`

## 服务器侧关键操作（Bandwagon）
- 目标机：`89.208.249.136:33693`
- Nginx 反代目标仍是 `127.0.0.1:3100`（Next.js via PM2）
- PM2 进程：`ensue-order`
- 代码目录：`/home/deploy/ensue-order`

## Dify 联通方案与现状
- 本地 Dify 为 Docker，自身在本机 `localhost`（公网不可直连）。
- 已尝试两种链路：
  1. Cloudflare quick tunnel（不稳定，已停）
  2. SSH 反向隧道（当前保留）
- 当前使用链路：
  - Bandwagon 访问 `http://127.0.0.1:17880` -> 反向到本地 `127.0.0.1:80`（Dify）
- 反向隧道启动命令（在本机执行）：
```bash
sshpass -p '***' ssh -o StrictHostKeyChecking=no -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -p 33693 -N -R 127.0.0.1:17880:127.0.0.1:80 root@89.208.249.136
```

## 当前阻塞 / 风险
- 主要阻塞不是站点部署，而是 Dify 工作流模型调用耗时过长且不稳定。
- 证据：
  - `plugin_daemon` 日志中 `dispatch/llm/invoke` 多次出现高耗时（45s / 63s / 99s）
  - 用户体感为“卡住”；部分请求只见 `event: ping`，长时间无完整答案
- 资源观察（本机 Docker）：
  - `weaviate` 占用较高（~3.2GiB）
  - `worker/web/api/plugin_daemon` 总体可用，但端到端延迟大

## 当前代码状态（本地仓库）
- 已修改（tracked）：
  - `app/page.tsx`
  - `app/globals.css`
- 新增（untracked）：
  - `app/chatbot/page.tsx`
  - `app/api/chat/route.ts`
- 另有用户历史未跟踪文件，未清理（保留原样）

## 下一步建议（按优先级）
1. 在 Dify Chatflow 将主模型临时切到稳定且低延迟模型，先验证 10~20 秒内可稳定出答案。
2. 降低检索负载（top_k、上下文拼接长度），减少 prompt token。
3. 关闭或延后自动会话命名（减少额外模型调用）。
4. 待 Dify 稳定后，再将站点 API 超时策略收敛到业务可接受值（当前已放宽）。
5. 如果需要生产稳定性：将 Dify 正式部署到服务器公网域名，替代本地反向隧道。

## 快速自检命令
```bash
# 1) 本地 Dify 直测（确认模型是否正常返回）
curl -N -X POST http://localhost/v1/chat-messages \
  -H 'Authorization: Bearer app-***' \
  -H 'Content-Type: application/json' \
  -d '{"inputs":{},"query":"Hello","response_mode":"streaming","user":"self-test"}'

# 2) 网站 API 代理测试
curl -s -X POST https://order.jify.com.cn/api/chat \
  -H 'content-type: application/json' \
  -d '{"query":"Hello"}'
```
