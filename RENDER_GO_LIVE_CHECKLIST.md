# Render Go-Live Checklist

## 目标

把当前系统从“可演示”推进到“可运营”：

- 食谱导入可真实入库
- 草稿可真实提交审批
- 审批与发布可真实持久化
- `L0` 数据也写入持久磁盘

## 上线前准备

### 代码

- [ ] GitHub 仓库已包含最新 `main`
- [ ] [render.yaml](/Users/jeff/Documents/New%20project/render.yaml) 已存在
- [ ] `npm run build` 通过
- [ ] `npm run deploy:check` 通过

### 必要文档

- [ ] 已阅读 [RENDER_DEPLOY_PLAN.md](/Users/jeff/Documents/New%20project/RENDER_DEPLOY_PLAN.md)
- [ ] 已阅读 [RECIPE_V3_PLAN.md](/Users/jeff/Documents/New%20project/RECIPE_V3_PLAN.md)
- [ ] 已确认当前阶段使用 `V3-lite`

## Render 控制台配置

### Blueprint

- [ ] 使用仓库根目录的 `render.yaml`
- [ ] Web Service 名称正确
- [ ] 持久磁盘已创建
- [ ] 磁盘挂载路径为 `/var/data`
- [ ] Region 选择符合实际

### 环境变量

必填：

- [ ] `DASHSCOPE_API_KEY`
- [ ] `DATA_DIR=/var/data`
- [ ] `RECIPES_DB_MODE=persistent`
- [ ] `RECIPES_DB_FILE=app.db`
- [ ] `L0_DB_FILE=l0_engine.db`

推荐：

- [ ] `DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`

可选：

- [ ] `BANGWAGONG_WEBHOOK_URL`
- [ ] `BANGWAGONG_API_TOKEN` 或 `BANGWAGONG_WEBHOOK_TOKEN`

## 首次部署后检查

### 运行状态

打开：

- `/api/runtime/status`

预期：

```json
{
  "data": {
    "recipe_store": {
      "mode": "persistent"
    }
  }
}
```

同时确认：

- [ ] `provider = sqlite-local`
- [ ] `data_dir = /var/data`
- [ ] `recipes_db_file = app.db`
- [ ] `l0_db_file = l0_engine.db`

### 页面

- [ ] `/recipes` 打开正常
- [ ] `/recipes/view` 打开正常
- [ ] `/recipes/approvals` 打开正常
- [ ] `/knowledge/l0/queue` 打开正常

## 首批业务验收

### 食谱系统

用一份简单样例跑完整链路：

- [ ] 导入文本或 docx
- [ ] 生成 `V3-lite` 预览
- [ ] 确认创建草稿
- [ ] 在查看页能看到草稿
- [ ] 创建修订并编辑
- [ ] 提交审批
- [ ] 审批通过
- [ ] 发布成功

### 复合菜验收

建议使用一个 `COMPOSITE` 样本：

- [ ] `COMPOSITE` 创建成功
- [ ] `assembly_components` 正确保存
- [ ] `assembly_steps` 正确保存
- [ ] 查看页可编辑并保存

### L0 验收

- [ ] `/knowledge` 页面打开正常
- [ ] L0 draft 可创建
- [ ] 审批 / 发布链路正常

## 数据持久化验证

至少做以下验证：

- [ ] 新建草稿后刷新页面，数据仍存在
- [ ] 重新部署后，历史草稿仍存在
- [ ] 发布后列表仍保留正确状态
- [ ] `L0` 数据在重新部署后仍存在

## 风险检查

### 高风险项

- [ ] 不再使用 Vercel 作为正式审批环境
- [ ] 不把 Render service 重建成无磁盘实例
- [ ] 不清空 `/var/data` 挂载盘

### 常见误配

- [ ] `DATA_DIR` 没设成 `/var/data`
- [ ] `RECIPES_DB_MODE` 没设为 `persistent`
- [ ] DashScope key 没配
- [ ] bangwagong token 变量名不一致

## 回滚策略

如果上线后异常：

1. 先看 `/api/runtime/status`
2. 确认 `recipe_store.mode`
3. 确认 Render 磁盘挂载是否还在
4. 回滚到上一个成功 deployment
5. 不删除持久磁盘

## 上线完成标准

满足以下条件后，才算真正上线：

- [ ] `recipe_store.mode = persistent`
- [ ] 导入到发布全链路跑通
- [ ] 复合菜 `COMPOSITE` 跑通
- [ ] L0 基础链路可用
- [ ] 重新部署后数据仍在
- [ ] 产品页不再显示“临时数据库环境”警告

