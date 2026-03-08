# 餐厅研发系统项目总控文档

## 1. 文档目的

这份文档是当前整个项目的唯一总入口，用来统一以下内容：

- 两个并行项目的边界与关系
- 当前阶段的目标和优先级
- GitHub 协作规则
- 仓库目录与文档治理规则
- 后续实施顺序

目标不是描述所有技术细节，而是建立一个干净、稳定、长期可维护的项目管理框架。

---

## 2. 当前两个并行项目

### 项目 A：餐厅业务系统

当前重点模块：

- 食谱系统
- 复合菜导入
- 审批流程
- 收货识别
- FOH 忌口判断
- 菜单管理

这个项目的核心是“业务可运行”。

它服务的是：

- 厨房研发
- 厨房生产查看
- 前厅沟通
- 内部标准化

### 项目 B：研发知识引擎 / 大 Chatbox

当前重点模块：

- L0-L6 知识结构
- L0 第一批问题提取
- 原理 / 实践 / 偏差 / playbook 组织
- 研发 AI 问答能力

这个项目的核心是“知识可解释、可推理、可复用”。

它服务的是：

- 研发训练
- 原理追溯
- 方法抽象
- 研发决策支持

---

## 3. 两个项目的关系

当前状态：

- 两个项目并行推进
- 现在不强耦合
- 未来一定会有交集

未来交集点：

1. 食谱步骤与知识原理绑定
2. 技术 family 与知识域映射
3. 关键控制点与偏差风险解释
4. Chatbox 对食谱数据库进行解释型问答

但当前原则是：

**先把业务系统跑稳，再把知识引擎挂上去。**

因此当前架构策略是：

- `V3-lite` 作为业务主模型
- `L0-L6` 作为知识覆盖层
- 两者通过最小锚点对接

当前最小锚点仅建议预留：

- `step_id`
- `point_id`
- `technique_family`

不在当前阶段直接把 `science_profile / principle_id` 等知识字段写进业务主 schema。

---

## 4. 当前产品方向结论

### 4.1 食谱系统采用 V3-lite

当前正式方向：

- `COMPOSITE`
- `ELEMENT`
- `RECIPE_REF`
- `REFERENCE_PREP`
- `RAW_ITEM`
- `FINISH_ITEM`

对应文档：

- [output/recipe-v3-lite-data-model-design.md](/Users/jeff/Documents/New%20project/output/recipe-v3-lite-data-model-design.md)

### 4.2 L0-L6 先独立演进

当前原则：

- L0-L6 不进入食谱主 schema
- 先保持为并行知识工程
- 等 V3-lite 业务链条稳定后，再做挂接

### 4.3 当前阶段优先级

P0：

- 食谱数据模型定稿
- 导入链路稳定
- 查看与审批流程可用

P1：

- L0-L6 知识层整理
- step / temperature point 锚点规划

P2：

- V3-lite 与 L0-L6 协同绑定
- 研发 Chatbox 对食谱库调用

---

## 5. 当前仓库的推荐定位

当前这个仓库应被视为：

**餐厅研发主仓库**

它同时承载两类内容：

1. 业务应用代码
2. 研发知识工程支撑代码与文档

但从治理角度，必须明确主次：

- 主线：餐厅业务系统
- 次线：知识工程与 AI 能力

因此未来文件组织必须围绕“主线清晰，次线不干扰”来整理。

---

## 6. 目录治理原则

## 6.1 根目录只放核心入口

根目录建议只保留：

- `README.md`
- `PROGRAM_MASTER_PLAN.md`
- `RESTAURANT_SYSTEM_OVERVIEW.md`
- `app/`
- `lib/`
- `schemas/`
- `scripts/`
- `handover/`
- `output/`

不建议继续在根目录新增大量散乱的独立 md。

## 6.2 `app/` 只放产品页面和 API

当前可以接受的结构：

- `app/recipes`
- `app/receiving`
- `app/foh`
- `app/knowledge`
- `app/chatbot`

规则：

- 页面逻辑按产品模块分
- API 路由按模块分
- 不要把手册文档塞进 `app/`

## 6.3 `lib/` 只放共享业务逻辑

当前建议用途：

- 数据库
- 权限
- AI 调用封装
- 类型定义
- 业务引擎

例如：

- `lib/db.ts`
- `lib/l0-engine.ts`
- `lib/qwen.ts`
- `lib/permissions.ts`

## 6.4 `schemas/` 只放正式 schema

例如：

- `recipe-record-v2.schema.json`
- 未来的 `element-record-v3-lite.schema.json`
- 未来的 `composite-record-v3-lite.schema.json`

## 6.5 `scripts/` 只放自动化脚本

例如：

- 导入回归测试
- docx 结构探测
- handover 检查
- L0 提取脚本

规则：

- 能自动执行的就放这里
- 不要把分析结论直接塞到脚本目录

## 6.6 `handover/` 只放过程文档

这里是过程层，不是最终产品文档。

适合放：

- session handover
- 每日记录
- 阶段 runbook
- backlog

不适合放：

- 最终数据模型定稿
- 面向项目长期治理的唯一总文档

## 6.7 `output/` 只放导出物和分析产物

例如：

- 测试报告
- 解析结果
- docx probe
- 设计导出稿

规则：

- `output/` 是产出层
- 不是长期唯一真相来源

也就是说：

- 可以先把设计稿导出到 `output/`
- 但正式定稿后，应提炼到稳定文档入口

---

## 7. 文档治理规则

这是当前最需要收紧的部分。

## 7.1 文档分三层

### A. 总控层

只有少数几份，负责定义全局方向。

建议保留：

- `PROGRAM_MASTER_PLAN.md`
- `README.md`
- `RESTAURANT_SYSTEM_OVERVIEW.md`

### B. 设计层

负责模块级设计。

例如：

- `output/recipe-v3-lite-data-model-design.md`
- 后续 `V3-lite migration plan`
- 后续 `L0-L6 integration plan`

后续建议逐步沉淀到稳定位置，不长期散落在 `output/`

### C. 过程层

负责临时讨论、handover、runbook、阶段记录。

例如：

- `handover/`
- `handover/v2_kb_rebuild/`

## 7.2 文档命名规则

建议统一：

- 总控文档：全大写，稳定命名
- 模块设计：小写连字符命名
- 过程文档：保留日期或阶段名

示例：

- `PROGRAM_MASTER_PLAN.md`
- `recipe-v3-lite-data-model-design.md`
- `l0-l6-integration-plan.md`
- `2026-03-weekly-status.md`

## 7.3 唯一入口原则

以后任何 agent 或新成员进入项目，第一步只看：

1. `README.md`
2. `PROGRAM_MASTER_PLAN.md`
3. 当前模块设计文档

不应该一上来就看几十份 handover。

---

## 8. GitHub 协作规则

## 8.1 当前仓库定位

GitHub 仓库：

- `restaurant-daily-order`

当前应作为：

- 主开发仓库
- 统一代码真相源

## 8.2 分支策略

建议最小化：

- `main`：稳定主线
- `codex/<topic>`：功能分支

例如：

- `codex/recipe-v3-lite`
- `codex/l0-integration-prep`

不要长期保留大量无意义实验分支。

## 8.3 提交规则

建议统一使用：

- `feat:`
- `fix:`
- `docs:`
- `refactor:`
- `chore:`

例如：

- `feat: add recipe composite import flow`
- `docs: finalize v3-lite data model`
- `fix: repair docx component parsing`

## 8.4 推送规则

每次推送前必须确认：

1. 不提交 `.env.local`
2. 不提交 `.next` 缓存
3. 不提交临时测试垃圾
4. 提交的文档能被别人直接读懂

## 8.5 GitHub 上应优先保留的内容

必须上 GitHub：

- 代码
- schema
- 稳定设计文档
- 关键 runbook
- 关键测试脚本

不建议长期保留：

- 大量临时 probe 结果
- 本地缓存
- 无结论的临时草稿

---

## 9. 当前推荐的文件整理策略

当前不建议马上大规模移动所有文件。  
先建立治理规则，再分批整理。

### Phase 1：建立唯一入口

已完成目标：

- 用 `PROGRAM_MASTER_PLAN.md` 统一项目方向

### Phase 2：识别“正式文档”和“过程文档”

建议保留为正式文档：

- `README.md`
- `PROGRAM_MASTER_PLAN.md`
- `RESTAURANT_SYSTEM_OVERVIEW.md`
- `output/recipe-v3-lite-data-model-design.md`

建议继续放过程层：

- `handover/`
- `handover/v2_kb_rebuild/`

### Phase 3：后续再做物理归档

后续可以把散乱的模块设计文档统一收进稳定目录，例如：

- `docs/product/`
- `docs/architecture/`
- `docs/data-model/`
- `docs/runbooks/`

但现在先不急着移动，先把结构原则定住。

---

## 10. 两个项目的协同工作方式

## 10.1 当前阶段

餐厅业务系统：

- 优先落地
- 优先稳定

L0-L6 知识引擎：

- 继续整理
- 继续积累
- 不阻塞业务系统

## 10.2 未来挂接方式

未来挂接只通过最小锚点：

- `step_id`
- `point_id`
- `technique_family`

知识引擎后续通过 sidecar 结构连接：

- step 绑定原理
- temperature point 绑定原理
- recipe version 绑定 science profile

当前阶段不直接写入主 schema。

---

## 11. 未来推荐的实施顺序

### 11.1 第一阶段

- 确认 `V3-lite` 数据模型
- 形成数据库迁移草案
- 明确前端页面改造范围

### 11.2 第二阶段

- 实施 `V3-lite`
- 跑通导入、查看、审批
- 让真实菜谱开始进入系统

### 11.3 第三阶段

- 清理知识工程文档
- 完成 L0-L6 主体整理
- 规划 sidecar 绑定结构

### 11.4 第四阶段

- 让大 Chatbox 可调用食谱系统
- 做解释型问答
- 做研发 AI 的知识增强

---

## 12. 当前项目管理结论

当前最重要的不是继续堆功能，而是：

1. 建立唯一总控文档
2. 确认 `V3-lite` 为一期主模型
3. 让业务系统和知识引擎并行但不互相拖死
4. 用 GitHub 作为唯一代码真相源
5. 用明确目录和文档规则降低混乱度

这份文档就是当前整个项目的总控起点。

---

## 13. 当前建议的下一步

建议按顺序推进：

1. 输出 `V3-lite` 数据库迁移 SQL 草案
2. 输出 `V3-lite` 前端页面改造方案
3. 输出 `L0-L6` 与 `V3-lite` 的 sidecar 协同设计文档
4. 分批整理现有 md 文档归属

如果后续没有新的总控文档，默认以本文件作为全局项目基准。
