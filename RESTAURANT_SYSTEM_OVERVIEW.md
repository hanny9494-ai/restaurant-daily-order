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
- 收货看板：`/receiving`（按供应商进入 `/receiving/supplier?date=&supplier_id=`）
- 差异单：`/discrepancies`
- 供应商对账：`/reconciliation`
- 品项主档：`/items`
- 每周盘点：`/stocktake`（录入 `/stocktake/count?id=`）
- 食材成本：`/cost`
- 食谱系统首页：`/recipes`
- 食谱新增：`/recipes/new`
- 食谱查看/修改：`/recipes/view`
- 食谱审批：`/recipes/approvals`
- 前厅端口（忌口识别）：`/foh`

---

## 3. 角色与使用场景
- 厨房下单人员：在 `/order` 录入并提交当天采购需求
- 采购/管理人员：在 `/dashboard` 查看汇总、导出、复制供应商下单文本
- 收货员（RECEIVER）：用自己的名字 + PIN 登录，在 `/receiving` 按供应商拍单对单、确认实收/拒收、登记事后退货
- 厨师长（CHEF）：标记「已发送」、处理差异单、复核锁定当天收货、审核盘点、看对账与成本
- 店长（MANAGER）：以上全部 + 员工管理 + 差异单结算 + 删除营业额
- 管理员（ADMIN）：以上全部 + 参数设置（价差阈值、盘点日）
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

## 4.2 下单 -> 发送 -> 拍单收货 -> 差异 -> 复核锁定 -> 对账（收货闭环）
1. 下单：`/order` 优先从品项主档选择（名称/别名自动关联 `item_id`，并统一成主档品名以便合并）；自由输入的品名进入「待归并」。
2. 发送：`/dashboard` 复制供应商文本后点「已发送」，供应商订单状态 `PENDING_SEND → SENT`（需 CHEF+ 登录）。
3. 收货：收货员 PIN 登录 → `/receiving` 看板 → 点供应商 → 拍/上传 1~N 张来货单（原图按 (日期, 供应商) 存档）。
4. OCR 对单：千问视觉识别品名/数量/单位/单价/金额/合计，与当日该供应商的订货清单逐项匹配，输出 ✅相符 / ⚠️数量差 / ❌缺货 / ➕多送 / 💰价差。匹配不上的单据行可人工「对应到订单品项」或「收下（多送）/不收」。识别失败或没有单据时可直接手工收货。
5. 逐行确认：实收数量、合格 / 部分拒收 / 全部拒收（数量+原因+问题照片）、单价与计价单位、备注；填写单据合计，对比系统金额。
6. 「暂存」→ `PARTIAL`；「完成收货」→ `RECEIVED`（未确认的订货行按未到货处理），自动生成差异单。
7. 复核锁定：所有供应商 `RECEIVED` 后，CHEF/MANAGER 在看板「复核并锁定当天」→ 全部 `REVIEWED`；解锁必须填原因，记录在 `receiving_lock_logs`。
8. 锁定后仍可登记「事后退货 / 换货」（负数红冲，按退货日期入账）。
9. 对账：`/reconciliation` 按供应商 + 日期区间查看应付并导出 xlsx。

## 4.2.1 每周盘点 -> 食材成本
1. `/stocktake` 发起盘点（默认每周固定一天，也可临时盘点），状态 `DRAFT → COUNTING → SUBMITTED → APPROVED`。
2. 盘点单按储位分组列出全部启用品项，多人可分储位同时录入；显示上次盘点数量；可按其他单位录入（如 箱）自动换算到基准单位。
3. 空 = 未盘，0 = 盘点为零；提交时提示未盘品项（可确认后按「未盘」提交，不计金额）。
4. CHEF/MANAGER 审核通过后锁定，并快照每个品项当时的最新进价（历史报表不受之后进价变动影响）。
5. `/cost` 录入每周/每日营业额；两次 APPROVED 盘点之间自动形成一个成本期间。

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

## 5.4.1 收货看板 `/receiving` 与按供应商收货 `/receiving/supplier`
- 看板：各供应商状态（待发送/已发送/部分收货/已收货/已复核）、发送人、收货人、未到货品项、待处理差异数、单据金额 vs 系统金额；底部复核锁定 / 解锁（需原因）；锁定日志；补送 / 临时来货入口。
- 按供应商收货：拍照（手机 `capture`，可多张，前端压缩到 1600px）、单据缩略图与忽略、对单结果、逐行确认（大按钮步进器、= 订货量 / 没到、拒收原因快捷选项、问题照片）、多送/补送品项（可关联原差异单，自动置为「已补送」）、金额核对、差异单列表、事后退货/换货。
- 主要 API：
  - `GET /api/supplier-orders?date=`（看板） / `POST /api/supplier-orders/send`
  - `POST /api/receiving/ocr`（上传单据 + OCR + 返回对单） / `DELETE /api/receiving/ocr/:id`（忽略该单据）
  - `GET /api/receiving/compare?date=&supplier_id=` / `POST /api/receiving/photos` / `POST /api/receiving/confirm`
  - `POST /api/receiving/review` / `POST /api/receiving/review/unlock`（旧 `/api/receiving/lock|unlock` 带员工会话时走同一逻辑）

## 5.4.2 差异单 `/discrepancies`
- 类型：`SHORT` 短缺/短斤、`REJECT_ON_SITE` 当场拒收、`RETURN_LATER` 事后退货（负数红冲）、`EXCHANGE` 换货（退+补）、`OVER_DELIVERY` 多送、`PRICE_MISMATCH` 单价差异（按报价入账、差价待确认）。
- 状态：`OPEN → RESOLVED_RESENT / RESOLVED_RETURNED / RESOLVED_DEDUCTED → SETTLED`。
- 自动生成：完成/暂存收货时按行重算（只替换仍为 OPEN 的自动差异单，已处理的保留）。
- API：`GET/POST /api/discrepancies`、`POST /api/discrepancies/:id/resolve`（CHEF+）、`POST /api/discrepancies/settle`（MANAGER+）。

## 5.4.3 供应商对账 `/reconciliation`
- 应付 = Σ(实收合格数量 × 单价) − 退货红冲 ± 调整。
- xlsx 工作表：应付汇总（按日+合计）、每日实收明细（订货/实收/拒收/合格/单价/金额/收货人/单据图片链接）、红冲与调整、未结差异、单据图片。
- API：`GET /api/reconciliation?supplier_id=&start=&end=`、`GET /api/reconciliation/export?...`

## 5.4.4 品项主档 `/items`
- 字段：品名、别名（OCR/下单匹配用）、品类、基准单位、默认供应商、储位、安全库存、启用；品项级单位换算（如 1 箱 = 10 千克；克/千克/斤自动互换）。
- 「待归并 / 历史候选」：从历史 `order_items` / `daily_list_items` 自动列出未关联品名，可批量建品项或作为别名合并进已有品项（历史记录自动回填 `item_id`）。
- 价格历史：每次合格收货的单价，换算到基准单位；最新进价 = 最近一次合格收货单价。
- API：`GET/POST /api/items`、`GET/PATCH /api/items/:id`、`GET /api/items/:id/prices`、`POST /api/items/:id/merge`、`GET/POST /api/items/candidates`。

## 5.4.5 盘点 `/stocktake` 与食材成本 `/cost`
- 盘点 API：`GET/POST /api/stocktakes`、`GET/DELETE /api/stocktakes/:id`、`POST /api/stocktakes/:id/counts|submit|approve|reopen`。
- 成本 API：`GET/POST /api/revenue`、`DELETE /api/revenue/:id`、`GET /api/cost`、`GET /api/cost/export`。
- 报表：各品类期初/采购/期末/消耗/占比、成本率趋势（按期）、品项消耗、消耗异常（较前 4 期均值偏差 > 30%）；xlsx 导出同内容。

## 5.4.6 员工与权限
- `staff` 表：姓名 + 个人 PIN（scrypt 哈希）+ 角色 RECEIVER / CHEF / MANAGER / ADMIN；在 `/dashboard/manage` 管理。新店首次打开任一收货/盘点页面时创建第一个账号（自动为 ADMIN）。
- 登录后返回 16 小时有效的签名 token（`x-staff-token` 头），所有新 API 均校验；收货、差异、复核、盘点、营业额都记录操作人，关键动作写入 `ops_audit_log`。
- 例外：`GET /api/items`（品项目录，不含价格）对下单端开放，因为 `/order` 不要求登录。

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
- 员工与审计：`staff`、`ops_audit_log`、`app_settings`
- 品项主档：`items`、`item_units`（`order_items` / `daily_list_items` / `receiving_items` 新增 `item_id`）
- 收货闭环：`supplier_orders`（按 日期+供应商 的状态）、`discrepancies`、`receiving_lock_logs`；`receiving_items` 新增 `received_quantity`、`rejected_quantity`、`reject_reason`、`problem_photo_file_id`、OCR 原始值、`match_status`、`reference_unit_price`、`received_by`；`receiving_scan_files` 新增 `supplier_id`、`kind`(INVOICE/PROBLEM)、`ocr_json`、`ocr_status`
- 盘点与成本：`stocktakes`、`stocktake_lines`（`unit_price_snapshot`/`value` 为审核时快照）、`revenue_entries`
- 迁移方式：`lib/ops/schema.ts`，只用 `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN`，旧库直接升级

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

新店独立部署（同一代码，完全独立数据）：
1. 复制 `.env.example`，设置独立的 `DATA_DIR`（SQLite 与单据图片都在其中）、`STORE_NAME` / `NEXT_PUBLIC_STORE_NAME`、`SEED_DEFAULT_SUPPLIERS=0`、`STOCKTAKE_WEEKDAY`、`STOCKTAKE_TIMING`、`PRICE_DEVIATION_THRESHOLD`，以及千问 `DASHSCOPE_API_KEY`。
2. `npm run build && npm run start`；首次打开 `/receiving` 创建管理员，再到 `/dashboard/manage` 添加员工、在 `/items` 建品项（或从历史候选导入）。
3. 与现有 order.jify.com.cn 实例互不影响（不同 DATA_DIR 即不同数据库）。

回归测试（使用临时 DATA_DIR、OCR mock，不触碰真实数据）：
- `npm run build && npm run test:receiving-loop`
- `npm run build && npm run test:stocktake`
- 也可指定 `E2E_BASE_URL=http://host:port`（该服务需 `RECEIVING_OCR_MOCK=1`）。

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

## 10.4.1 收货对单与差异规则
- 名称匹配：标准化（去空格/标点、全角数字）→ 品项主档名称/别名命中同一 `item_id` → 字符二元组相似度（≥0.5，包含关系 0.85），全局按分数贪心配对。
- 单据数量/单价按品项换算（品项单位换算 + 重量单位）转换到下单单位后比较。
- 价差：与该品项在收货日期之前最近一次合格收货单价（换算到下单单位）比较，偏差 > 阈值（默认 15%）标 💰 并生成 `PRICE_MISMATCH`，金额 = (本次 − 参考) × 合格数量；处理为「扣款」时默认应付调整 = −该金额。
- `SHORT`：实收 < 订货；`REJECT_ON_SITE`：拒收数量 > 0；`OVER_DELIVERY`：实收 > 订货（含未订货品项）。短缺和拒收不影响应付（应付只按合格数量计），只做记录与追踪。
- `RETURN_LATER` / `EXCHANGE`：数量 ≤ 合格数量 − 已退数量；应付调整 = −数量 × 单价，按 `effective_date`（退货日期）入账，锁定日期后也能登记。
- 旧收货记录（无 `received_quantity`）视为：质量合格则实收 = 订货数量，否则 0。

## 10.4.2 盘点与成本计算规则
- 成本期间 = 相邻两次 APPROVED 盘点；`STOCKTAKE_TIMING=END_OF_DAY`（默认）时采购窗口为 (期初日, 期末日]，`START_OF_DAY` 时为 [期初日, 期末日)。
- 库存金额 = 基准单位数量 × 审核时快照的最新进价（盘点日及之前最近一次合格收货的基准单位价）。
- 本期采购 = Σ(合格数量 × 单价) + 本期入账的退货红冲与调整（按品项品类归类，未关联品项的计入「未归类」）。
- 食材成本 = 期初库存金额 + 本期采购 − 期末库存金额；成本率 = 食材成本 / 本期营业额（只计完全落在采购窗口内的营业额记录，跨期记录会提示）。
- 消耗异常：品项消耗量（期初 + 采购基准量 − 期末）与前最多 4 期均值比较，偏差 > `CONSUMPTION_ANOMALY_THRESHOLD`（默认 30%）提示。

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
