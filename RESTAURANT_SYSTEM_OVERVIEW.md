# 餐厅管理系统总览（不含 Chatbox / 不含知识层）

## 1. 文档范围
本文件覆盖当前系统的餐厅运营功能，包含：
- 下单端
- 汇总端
- 收货端
- 管理设置
- 食谱系统
- 前厅忌口识别
- 导出与基础配置

不包含：
- `chatbot` 相关页面/API
- `knowledge` 与 `l0` 相关页面/API

---

## 2. 系统入口
- 首页：`/`
- 总入口：`/ui`
- 下单端：`/order`
- 汇总端：`/dashboard`
- 管理设置：`/dashboard/manage`
- 收货端：`/receiving`
- 食谱系统首页：`/recipes`
- 食谱新增：`/recipes/new`
- 食谱查看/修改：`/recipes/view`
- 食谱审批：`/recipes/approvals`
- 前厅端口（忌口识别）：`/foh`

---

## 3. 角色与使用场景
- 厨房下单人员：在 `/order` 录入并提交当天采购需求
- 采购/管理人员：在 `/dashboard` 查看汇总、导出、复制供应商下单文本
- 收货人员：在 `/receiving` 验收质量、录入单价、锁定收货
- 管理员：在 `/dashboard/manage` 维护供应商、单位、PIN
- 研发/后厨主管：在食谱系统维护配方、版本、审批发布
- 前厅人员：在 `/foh` 输入客人忌口，快速判断可吃/不可吃菜品

---

## 4. 核心业务流程

## 4.1 下单 -> 汇总
1. 厨房在 `/order` 选择工位、供应商、品项、数量、单位、备注。
2. 订单可先暂存（本地 localStorage），再批量提交。
3. `/dashboard` 按供应商自动分组汇总，支持复制文本给供应商。
4. 支持按日期或日期范围导出 Excel。

## 4.2 汇总 -> 收货锁定
1. 收货端按日期拉取当日快照（`daily_list`）。
2. 收货时对每条记录标注质量（Good/No）、录入单价和计价单位。
3. 系统自动做单位换算（如克/千克/斤）。
4. 保存时会锁定当日收货，避免后续随意改动。
5. 若发现问题可在收货端解锁并修正。

## 4.3 食谱生命周期
1. `/recipes/new` 新建食谱，自动创建 `v1` 草稿。
2. `/recipes/view` 查看配方与步骤，编辑模式行内修改。
3. 草稿提交审批后进入 `PENDING_REVIEW`。
4. `/recipes/approvals` 审批通过/驳回；通过后可发布。
5. 发布后成为当前生效版本，并可触发 `bangwagong` 同步。

## 4.4 前厅忌口识别
1. 前厅在 `/foh` 输入客人忌口（支持逗号/换行）。
2. 系统按当前食谱库进行规则匹配。
3. 输出「不能吃」与「可吃」清单，并给出命中原因。
4. 识别结果自动存档，支持按日期回看。

---

## 5. 功能模块明细

## 5.1 下单端 `/order`
- 选择工位、供应商、单位
- 多行品项录入
- 暂存草稿与待提交列表（localStorage）
- 批量提交订单
- 当日订单列表查看与删除

主要 API：
- `GET /api/stations`
- `GET /api/suppliers`
- `GET /api/units`
- `GET /api/order?date=YYYY-MM-DD`
- `POST /api/order`
- `DELETE /api/order/:id`

## 5.2 汇总端 `/dashboard`
- PIN 解锁保护
- 今日订单汇总
- 按供应商分组展示
- 一键复制供应商下单文本
- Excel 导出（单日/区间）

主要 API：
- `GET /api/order?date=...`
- `GET /api/order/export?date=...`
- `GET /api/order/export?start=...&end=...`

## 5.3 管理设置 `/dashboard/manage`
- 设置/修改/清除 Dashboard PIN
- 供应商管理：新增、改名、停用、恢复
- 单位管理：新增、改名、停用、恢复

主要 API：
- `GET/POST /api/suppliers`
- `PATCH/DELETE /api/suppliers/:id`
- `GET/POST /api/units`
- `PATCH/DELETE /api/units/:id`

## 5.4 收货端 `/receiving`
- 按日期读取收货快照
- 质量状态录入（Good / No）
- 单价录入与计价单位换算
- 自动统计当日合格总金额
- 保存并锁定、异常解锁

主要 API：
- `GET /api/daily-list?date=...`
- `POST /api/receiving`
- `POST /api/receiving/unlock`

## 5.5 食谱系统

### 5.5.1 食谱新增 `/recipes/new`
- 新建 `MENU` 或 `BACKBONE` 食谱
- `MENU` 要求 `menu_cycle`
- 自动生成首个草稿版本

### 5.5.2 食谱查看/修改 `/recipes/view`
- 表格查看：配方 + 制作步骤
- 编辑模式：行内修改原料/步骤/基础字段
- 当前版本不可编辑时，可一键创建修订并进入编辑

### 5.5.3 审批中心 `/recipes/approvals`
- 查看待审批版本
- 审批通过/驳回
- 发布版本

食谱主要 API：
- `GET /api/recipe-users`
- `GET /api/recipes`
- `POST /api/recipes`
- `GET/PATCH /api/recipes/:id`
- `POST /api/recipes/:id/revision`
- `PATCH /api/recipes/versions/:versionId`
- `POST /api/recipes/versions/:versionId/submit`
- `POST /api/recipes/versions/:versionId/review`
- `POST /api/recipes/versions/:versionId/publish`
- `GET /api/recipes/approvals`

## 5.6 前厅端口 `/foh`
- 输入客人忌口、桌号、日期
- 支持按 `MENU/BACKBONE/ALL` 检查范围
- 返回不可食用菜品与命中原因
- 保存历史识别记录

主要 API：
- `POST /api/foh/check`
- `GET /api/foh/checks?date=YYYY-MM-DD`

---

## 6. 数据模型（SQLite）
数据库文件：`data/app.db`

核心表：
- 基础配置：`stations`、`suppliers`、`units`
- 下单：`order_items`
- 汇总快照：`daily_lists`、`daily_list_items`
- 收货：`receiving_items`
- 食谱权限：`recipe_users`
- 食谱主档：`recipes`
- 食谱版本：`recipe_versions`
- 食谱原料：`recipe_ingredients`
- 食谱同步日志：`recipe_sync_logs`
- 前厅识别日志：`foh_guest_checks`

---

## 7. 食谱记录规范（v2）
食谱版本记录使用 `recipe-record-v2` 结构（Schema 已落地）：
- 文件：`schemas/recipe-record-v2.schema.json`
- 顶层字段：`meta`、`production`、`allergens`、`ingredients`、`steps`
- 审批前会做结构与必填校验

---

## 8. 对外集成
- `bangwagong`：发布食谱版本时可回调 webhook
- 环境变量：
  - `BANGWAGONG_WEBHOOK_URL`
  - `BANGWAGONG_API_TOKEN`（可选）

---

## 9. 部署与运行

本地：
1. `npm install`
2. `npm run dev`（开发）或 `npm run build && npm run start`（稳定）

Vercel 预览：
- 使用 `vercel --yes` 触发 preview 部署
- 当前代码已支持测试环境直接访问全部餐厅核心模块

---

## 10. 关键业务逻辑规则（细则）

## 10.1 下单同类合并规则（汇总快照）
- 合并键：`supplier_id + item_name + unit`。
- 只在同一天（`date`）内合并，不跨天。
- 合并结果写入 `daily_list_items`：
  - `total_quantity = 同键订单数量求和`
  - `source_count = 同键来源订单条数`
- 若当天快照已存在则“增量重算”：
  - 已存在同键：更新 `total_quantity/source_count`
  - 新出现同键：新增记录
  - 旧键消失：若该行尚未产生收货记录则删除；已收货则保留（防止丢失收货依据）

## 10.2 快照与锁单规则
- 当天第一次生成汇总时自动创建 `daily_lists` 记录。
- 收货保存成功后自动写入 `receiving_locked_at`，当日进入锁定状态。
- 锁定后不允许继续改收货，需先执行解锁接口。
- 锁定后即使有新下单，汇总生成逻辑也不会覆盖已锁定快照。

## 10.3 收货录入与单位换算
- 收货以 `daily_list_item_id` 作为唯一键 `upsert` 到 `receiving_items`。
- `quality_ok = 1` 时允许录入单价；`quality_ok = 0` 时单价字段清空。
- 若计价单位和下单单位不同，系统执行单位换算后写入标准化 `unit_price`。
- 不可换算场景直接报错（`INVALID_PRICE_UNIT_CONVERSION`），阻断保存。

## 10.4 下单与汇总的一致性
- 下单写入 `order_items`，状态默认 `submitted`。
- 汇总是从 `order_items` 实时重算快照，不是单独手工维护。
- 导出前会确保目标日期已有最新快照，避免导出脏数据。

## 10.5 食谱编辑与审批状态机
- 仅 `DRAFT / REJECTED` 允许编辑。
- `PENDING_REVIEW / APPROVED / PUBLISHED` 为只读。
- 提交流程：
  - `DRAFT|REJECTED -> PENDING_REVIEW`（提交审批）
  - `PENDING_REVIEW -> APPROVED|REJECTED`（审批）
  - `APPROVED -> PUBLISHED`（发布）
- 若当前版本不可编辑，必须先创建 `revision` 形成新草稿再改。

## 10.6 食谱类型约束
- `recipe_type = MENU` 时，`menu_cycle` 必填且非空。
- `recipe_type = BACKBONE` 时，`menu_cycle` 必须为 `null`。
- 以上规则在接口入库前强校验，不满足即拒绝写入。

## 10.7 食谱 JSON 记录强校验
- `recipe_versions.record_json` 固定为 v2 结构：
  - `meta`、`production`、`allergens`、`ingredients`、`steps`
- 禁止额外字段（`additionalProperties = false`）。
- `ingredients`、`steps` 至少 1 条。
- 审批提交前强校验，不通过返回 `INVALID_RECIPE_RECORD:*`。
