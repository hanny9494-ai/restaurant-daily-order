# 餐厅食谱系统 V3 方案

## 1. 方案定位

本文档定义食谱系统 `V3` 的正式方案。

当前结论：

- 实施版本采用 `V3-lite`
- 先解决复合菜、子配方、导入、查看、审批
- 暂不把 L0-L6 知识字段直接写入主 schema
- 仅为未来知识挂接预留最小锚点

这份方案面向：

- 产品设计
- 数据库设计
- API 设计
- 前端改造
- 后续与知识引擎协同

---

## 2. 业务背景

当前餐厅的真实食谱结构，不再是“一道菜 = 一条配方”。

实际情况包括：

- 一道菜由多个 component 组成
- component 内还会引用其他 preparation
- 有些 item 只是 garnish / plating element
- 有些 prep 是基础库资产，不属于任何单一菜单菜
- cookbook 文档结构多样，不是统一格式

因此 V2 的单层 recipe 结构无法继续承载后续业务。

---

## 3. V3 总体目标

V3 需要同时满足以下目标：

1. 支持复合菜结构
2. 支持子配方独立录入和独立审批
3. 支持基础库 recipe 独立存在
4. 支持菜级查看和 element 级查看
5. 支持 cookbook 风格导入
6. 支持版本可追溯
7. 为未来 L0-L6 知识挂接保留最小锚点

---

## 4. V3 正式范围

## 4.1 一期纳入范围

V3 一期正式采用 `V3-lite`，纳入：

- `COMPOSITE`
- `ELEMENT`
- `RECIPE_REF`
- `REFERENCE_PREP`
- `RAW_ITEM`
- `FINISH_ITEM`
- `recipes`
- `recipe_versions`
- `recipe_version_components`
- `TO FINISH / TO COMPLETE -> assembly layer`
- cookbook 三类导入模式

## 4.2 一期不纳入范围

以下能力不在一期落地：

- seasonal slot system
- family_code
- slot_code
- 自动变体切换
- 复杂依赖图可视化
- inline item 自动升格为 recipe
- L0-L6 直接写入 recipe 主 schema

---

## 5. 核心建模

## 5.1 主实体

系统中只有两类可版本化 recipe 实体：

- `COMPOSITE`
- `ELEMENT`

### COMPOSITE

表示整道菜。

特征：

- 对应菜单上的一道菜
- 存 dish 层信息
- 存 assembly / plating 逻辑
- 通过组件引用 element 或 item

### ELEMENT

表示可独立制作、可独立审批、可独立复用的子配方。

例如：

- stock
- sauce
- puree
- bavarois
- tart
- crouton
- jam
- syrup

---

## 5.2 业务类型

`business_type`：

- `MENU`
- `BACKBONE`

解释：

- `MENU`：面向菜单或菜单组件
- `BACKBONE`：基础库资产，可被复用

---

## 5.3 组件依赖类型

`component_kind`：

- `RECIPE_REF`
- `REFERENCE_PREP`
- `RAW_ITEM`
- `FINISH_ITEM`

说明：

### RECIPE_REF

引用系统中已有 recipe version。

例如：

- `Poached Lobster -> Meyer Lemon Beurre Blanc`

### REFERENCE_PREP

当前文档中提到，但正文未展开的 prep。

例如：

- `Tomato Water (this page)`
- `Quick Squab Sauce (page 229)`

### RAW_ITEM

直接使用的食材或单项原料。

例如：

- `olive oil`
- `duck foie gras`

### FINISH_ITEM

最后用于点缀、装盘、出品的 item。

例如：

- `onion blossoms`
- `basil blooms`

---

## 5.4 工序层

`section`：

- `PREP`
- `INTERMEDIATE`
- `ASSEMBLY`
- `FINISH`
- `PLATING`

作用：

- 给组件分层
- 让查看页和导入页有统一结构

---

## 5.5 技术分类

`technique_family` 作为简化分类字段保留。

建议枚举：

- `SAUCE`
- `PUREE`
- `GEL`
- `BAVAROIS`
- `PICKLE`
- `SALAD`
- `STOCK`
- `CRUMBLE`
- `CROUTON`
- `BEURRE_BLANC`
- `BRINE`
- `SYRUP`
- `JAM`
- `BREAD`
- `FAT`
- `CULTURED_DAIRY`
- `OIL`
- `OTHER`

一期用途：

- 识别辅助
- 基础筛选
- 未来知识域映射入口

---

## 6. 数据库方案

## 6.1 recipes

```sql
CREATE TABLE recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('COMPOSITE', 'ELEMENT')),
  business_type TEXT NOT NULL CHECK (business_type IN ('MENU', 'BACKBONE')),
  technique_family TEXT,
  created_by TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6.2 recipe_versions

```sql
CREATE TABLE recipe_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED')
  ),
  record_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  review_note TEXT,
  approved_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(recipe_id, version),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id)
);
```

说明：

- 所有内容存入 version
- `COMPOSITE` 与 `ELEMENT` 共用版本体系

---

## 6.3 recipe_version_components

```sql
CREATE TABLE recipe_version_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_version_id INTEGER NOT NULL,
  component_kind TEXT NOT NULL CHECK (
    component_kind IN ('RECIPE_REF', 'REFERENCE_PREP', 'RAW_ITEM', 'FINISH_ITEM')
  ),
  child_recipe_id INTEGER,
  child_version_id INTEGER,
  display_name TEXT NOT NULL,
  component_role TEXT,
  section TEXT NOT NULL CHECK (
    section IN ('PREP', 'INTERMEDIATE', 'ASSEMBLY', 'FINISH', 'PLATING')
  ),
  quantity TEXT,
  unit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_optional INTEGER NOT NULL DEFAULT 0,
  source_ref TEXT,
  prep_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_version_id) REFERENCES recipe_versions(id),
  FOREIGN KEY (child_recipe_id) REFERENCES recipes(id),
  FOREIGN KEY (child_version_id) REFERENCES recipe_versions(id)
);
```

说明：

- 这是 V3 的核心关系表
- `ELEMENT` 也允许引用其他 `ELEMENT`
- 但发布时必须做循环引用校验

---

## 7. JSON 结构方案

V3 采用两套 JSON：

- `element-record-v3-lite`
- `composite-record-v3-lite`

---

## 7.1 Element Record

```json
{
  "meta": {
    "dish_code": "EL_CHICKEN_STOCK",
    "dish_name": "Chicken Stock",
    "display_name": "Chicken Stock",
    "aliases": [],
    "entity_kind": "ELEMENT",
    "business_type": "BACKBONE",
    "technique_family": "STOCK",
    "menu_cycle": null,
    "plating_image_url": ""
  },
  "production": {
    "yield": "5 litres",
    "net_yield_rate": 1,
    "key_temperature_points": []
  },
  "allergens": [],
  "ingredients": [],
  "steps": [
    {
      "step_id": "step_001",
      "step_no": 1,
      "action": "Wash the bones under cold water.",
      "time_sec": 0,
      "equipment": ["sink"]
    }
  ],
  "component_refs": []
}
```

补充说明：

- 一期建议在 `steps[]` 中预留 `step_id`
- 一期建议在 `key_temperature_points[]` 中预留 `point_id`
- 一期建议在 `meta` 中增加 `display_name` 与 `aliases`
- 一期建议在 `steps[]` 中增加 `equipment`
- 但不加入 `principle_id`

---

## 7.2 Composite Record

```json
{
  "meta": {
    "dish_code": "MENU_LOBSTER",
    "dish_name": "Lobster",
    "display_name": "Lobster",
    "aliases": [],
    "entity_kind": "COMPOSITE",
    "business_type": "MENU",
    "menu_cycle": "2026_SPRING",
    "plating_image_url": ""
  },
  "production": {
    "serves": "8"
  },
  "assembly_components": [
    {
      "component_kind": "RECIPE_REF",
      "child_code": "EL_LOBSTER_SAUCE",
      "ref_name": "Lobster Sauce",
      "component_role": "SAUCE",
      "section": "FINISH",
      "sort_order": 1
    },
    {
      "component_kind": "FINISH_ITEM",
      "ref_name": "Yellow daisy",
      "component_role": "PLATING",
      "section": "PLATING",
      "sort_order": 2
    }
  ],
  "assembly_steps": [
    {
      "step_id": "assembly_001",
      "step_no": 1,
      "action": "Plate all prepared elements according to the standard.",
      "equipment": ["plate", "spoon"]
    }
  ]
}
```

---

## 8. 导入策略

V3 一期必须支持三类 cookbook 结构。

## 8.1 Components 模式

特征：

- 有顶层 dish 标题
- 有 `Components:`
- 列出多个 component

输出：

- 1 个 `COMPOSITE`
- 多个 `ELEMENT`

示例：

- `Lobster`

---

## 8.2 Section 模式

特征：

- 一个主标题
- 多个 section recipe
- 最后有 `TO FINISH`

输出：

- 1 个 `COMPOSITE`
- 多个 `ELEMENT`
- `TO FINISH` 拆成 assembly layer

示例：

- `Tomato Salad with Basil and Shallot`
- `Caviar with Corn and Bonito`

---

## 8.3 For-the-X 模式

特征：

- 顶部先分组列原料
- 后文用 `FOR THE X`
- 最后 `TO COMPLETE`

输出：

- 1 个 `COMPOSITE`
- 多个 `ELEMENT`
- ingredient block 与 method block 进行匹配

示例：

- `Pan-Roasted Breast of Squab...`

---

## 8.4 Basic Recipes 模式

特征：

- 文档为基础库 recipe 集合
- 不对应单一主菜

输出：

- 不生成 `COMPOSITE`
- 直接生成多个 `ELEMENT`
- 默认 `business_type = BACKBONE`

示例：

- `Basic Sugar Syrup`
- `Chicken Stock`
- `Clarified Butter`

---

## 9. API 方案

## 9.1 导入接口

继续保留：

- `POST /api/recipes/import`
- `POST /api/recipes/import/confirm`

V3 变化：

- 返回结构不再只是平铺 recipes
- 应能返回：
  - `composite_draft`
  - `element_drafts`
  - `unresolved_refs`
  - `finish_items`

一期也可以先保持单数组返回，但内部数据结构要区分：

- `entity_kind`
- `component_kind`

---

## 9.2 查看接口

建议新增或重构：

- `GET /api/recipes/:id`
  - 返回 recipe 基本信息
  - 返回当前版本
  - 若为 composite，则返回 assembly components

- `GET /api/recipes/:id/graph`
  - 一期可选
  - 返回简单依赖树

---

## 9.3 审批接口

继续按 `recipe_version` 粒度审批：

- `POST /api/recipes/versions/:versionId/submit`
- `POST /api/recipes/versions/:versionId/review`
- `POST /api/recipes/versions/:versionId/publish`

一期不做“整组批量审批”底层逻辑，但 UI 可以做成组展示。

---

## 10. 前端页面方案

## 10.1 导入页

目标：

- AI 先提取
- 人工审核
- 再入库

建议界面结构：

1. 上传区
2. 解析结果总览
3. `Composite` 草稿区
4. `Element` 草稿区
5. `Unresolved refs` 区
6. `Finish items` 区
7. 审核确认后创建草稿

---

## 10.2 查看页

建议拆成三层：

### A. Composite 视图

展示：

- dish meta
- assembly components
- assembly steps

### B. Element 视图

展示：

- ingredients
- steps
- production

### C. Structure 视图

按 section 展示：

- PREP
- INTERMEDIATE
- ASSEMBLY
- FINISH
- PLATING

---

## 10.3 审批页

一期仍按 version 审批，但 UI 应能识别：

- 这是 `COMPOSITE`
- 这是 `ELEMENT`

对 `COMPOSITE` 额外展示：

- 依赖 components
- unresolved refs

---

## 11. 一期必须实现的校验

## 11.1 schema 校验

- `COMPOSITE` 与 `ELEMENT` 分 schema 校验
- `TO FINISH` 不能误生成新的 recipe

## 11.2 引用校验

当 `component_kind = RECIPE_REF` 时：

- 若存在 `child_version_id`，必须合法
- 发布时必须校验子版本状态

## 11.3 循环引用校验

在发布时检查：

- `A -> B -> A` 不允许

一期只需做发布前校验，不要求复杂可视化。

## 11.4 基础录入完整性

对 `ELEMENT`：

- ingredients
- steps
- production

对 `COMPOSITE`：

- assembly components
- assembly steps

---

## 12. 与 L0-L6 的关系

当前原则：

- `V3-lite` 先保持业务主模型
- `L0-L6` 先保持独立知识引擎
- 未来通过 sidecar 结构协同

一期只建议预留：

- `step_id`
- `point_id`
- `technique_family`

不在一期内：

- 增加 `principle_id`
- 增加 `science_profile`
- 增加知识绑定字段到主 schema

---

## 13. 实施阶段划分

## Phase 1：模型定稿

输出：

- 本文档
- schema 草案
- 数据库迁移草案

## Phase 2：数据库升级

实施：

- `recipes` 扩展
- `recipe_versions` 扩展
- 新建 `recipe_version_components`

## Phase 3：导入链路升级

实施：

- `COMPOSITE` 识别
- `ELEMENT` 拆分
- `TO FINISH` 拆分
- unresolved refs 识别

## Phase 4：查看与审批升级

实施：

- composite 视图
- element 视图
- 结构展示
- 审批页增强

## Phase 5：知识协同准备

实施：

- `step_id`
- `point_id`
- L0-L6 sidecar 设计

---

## 14. 当前正式决策

当前正式采用的路线：

1. `V3` 按 `V3-lite` 落地
2. 先解决业务模型，不解决复杂变体抽象
3. 先把导入、查看、审批跑通
4. 未来与 L0-L6 通过 sidecar 对接

这是当前最稳、最能落地的版本。

---

## 15. 下一步产出建议

在这份方案之后，建议继续输出：

1. `V3-lite 数据库迁移 SQL 草案`
2. `V3-lite schema 草案`
3. `V3-lite 前端页面改造方案`
4. `L0-L6 与 V3-lite sidecar 协同设计`

如果后续没有新的高层方案替代，默认以本文件作为 `V3` 的执行基准。
