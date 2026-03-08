# Render Deploy Plan

## 目标

把当前餐厅管理系统部署到带持久磁盘的环境，解决 Vercel 临时 SQLite 不能稳定入库、提交审批、审批、发布的问题。

## 当前结论

- Vercel 适合：
  - 前端预览
  - 上传解析
  - 结构预览
- Vercel 不适合：
  - 创建草稿
  - 提交审批
  - 审批
  - 发布

原因：SQLite 在 Vercel 运行时只写入临时文件系统。

## 本次已落地

### 1. 代码支持自定义数据目录

- `DATA_DIR`
- `RECIPES_DB_FILE`
- `L0_DB_FILE`

相关文件：

- [lib/data-paths.ts](/Users/jeff/Documents/New%20project/lib/data-paths.ts)
- [lib/db.ts](/Users/jeff/Documents/New%20project/lib/db.ts)
- [lib/l0-engine.ts](/Users/jeff/Documents/New%20project/lib/l0-engine.ts)
- [lib/knowledge-admin.ts](/Users/jeff/Documents/New%20project/lib/knowledge-admin.ts)

### 2. Render Blueprint

已新增：

- [render.yaml](/Users/jeff/Documents/New%20project/render.yaml)

核心配置：

- Web Service
- 持久磁盘挂载到 `/var/data`
- `DATA_DIR=/var/data`
- `RECIPES_DB_MODE=persistent`
- 健康检查：`/api/runtime/status`

## Render 上线步骤

1. 把当前仓库推到 GitHub
2. 在 Render 创建 Blueprint
3. 选择仓库根目录
4. 检查 `render.yaml`
5. 补环境变量：
   - `DASHSCOPE_API_KEY`
   - `BANGWAGONG_WEBHOOK_URL`（如需）
   - `BANGWAGONG_WEBHOOK_TOKEN`（如需）
6. 首次部署完成后，打开：
   - `/api/runtime/status`
   - `/recipes`
   - `/recipes/view`
   - `/recipes/approvals`

## 上线后预期

`/api/runtime/status` 应返回：

```json
{
  "data": {
    "recipe_store": {
      "mode": "persistent",
      "provider": "sqlite-local"
    }
  }
}
```

## 下一步建议

1. 把当前未提交改动推到 GitHub
2. 用 Render Blueprint 部署
3. 在 Render 环境做一次全链路测试：
   - 导入
   - 确认创建草稿
   - 提交审批
   - 审批
   - 发布

