# 餐厅食谱系统 V3-Lite 数据模型设计文档

## 1. 文档目的

`V3-lite` 是 `V3` 的收敛版本，用于先把一期真正必要的结构定下来，避免一开始过度设计。

目标：

- 支持复合菜
- 支持子部件独立录入、独立审批、独立查看
- 支持 cookbook 风格多 section 导入
- 支持 `TO FINISH / TO COMPLETE` 拆成装盘层
- 支持基础库 recipe 独立存在
- 支持版本绑定

不在一期内解决：

- seasonal slot system
- family_code / slot_code
- 自动变体切换
- 复杂依赖图分析
- inline item 自动升格为 recipe

---

## 2. 一期设计原则

### 2.1 只保留两类 recipe 实体

- `COMPOSITE`
- `ELEMENT`

解释：

- `COMPOSITE`：整道菜
- `ELEMENT`：可独立制作的子配方或基础配方

### 2.2 依赖项不必都建成 recipe

V3-lite 支持四类依赖项：

- `RECIPE_REF`
- `REFERENCE_PREP`
- `RAW_ITEM`
- `FINISH_ITEM`

解释：

- `RECIPE_REF`：引用系统中已有 recipe
- `REFERENCE_PREP`：文档中提到、但当前未展开正文的 prep
- `RAW_ITEM`：直接使用的原料或成品原料
- `FINISH_ITEM`：最后点缀、装盘、出品 item

### 2.3 `TO FINISH` 只做 assembly layer

`TO FINISH`、`TO COMPLETE` 不生成独立 recipe。

它们只拆成：

- `assembly_components`
- `assembly_steps`

### 2.4 所有 recipe 引用尽量绑定版本

当 `component_kind = RECIPE_REF` 时，应尽量绑定：

- `child_recipe_id`
- `child_version_id`

这样能保证发布后的可追溯性。

### 2.5 允许基础库 recipe 独立存在

例如：

- `Chicken Stock`
- `Clarified Butter`
- `Basic Sugar Syrup`

它们不需要属于某一道 composite dish。

---

## 3. 核心概念

## 3.1 COMPOSITE

表示整道菜。

特点：

- 对应菜单上的一道菜
- 自身不复制所有 child 的详细做法
- 通过组件引用组成整道菜
- 拥有 dish-level 的 plating / assembly 逻辑

示例：

- `Lobster`
- `Tomato Salad with Basil and Shallot`
- `Pan-Roasted Breast of Squab with Swiss Chard...`

## 3.2 ELEMENT

表示可独立制作、可复用、可审批、可检索的 recipe。

示例：

- `Lobster Sauce`
- `Tomato Bavarois`
- `Meyer Lemon Beurre Blanc`
- `Chicken Stock`
- `Clarified Butter`

---

## 4. 业务分类

### 4.1 business_type

- `MENU`
- `BACKBONE`

示例：

- `Lobster Sauce` 可以是 `MENU`
- `Chicken Stock` 可以是 `BACKBONE`

### 4.2 technique_family

一期建议保留，但只作为简单分类字段。

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

说明：

- 一期只做筛选和识别辅助
- 不做复杂逻辑判断

---

## 5. 依赖项类型

## 5.1 RECIPE_REF

已经在系统中存在的 recipe 引用。

例如：

- `Poached Lobster` 引用 `Meyer Lemon Beurre Blanc`
- 主菜引用 `Lobster Bisque Sauce`

## 5.2 REFERENCE_PREP

文档里提到，但当前正文没展开的 prep。

例如：

- `Tomato Water (this page)`
- `Quick Squab Sauce (page 229)`

## 5.3 RAW_ITEM

直接使用的食材或非 recipe 级 item。

例如：

- `olive oil`
- `duck foie gras`

## 5.4 FINISH_ITEM

用于最后点缀、装盘的 item。

例如：

- `onion blossoms`
- `basil blooms`
- `cracked black pepper`

---

## 6. section 设计

一期建议保留简单的工序层：

- `PREP`
- `INTERMEDIATE`
- `ASSEMBLY`
- `FINISH`
- `PLATING`

用来表达：

- 这个 component 是前置制作
- 这个 component 是中间组合件
- 这个 component 是最后组装用
- 这个 component 是 finishing 用
- 这个 component 是 plating 装饰

---

## 7. 数据库设计

## 7.1 recipes

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

说明：

- `entity_kind` 决定结构角色
- `business_type` 决定业务属性
- `technique_family` 做基础分类

---

## 7.2 recipe_versions

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

- 所有 recipe 都通过 version 存储内容
- `COMPOSITE` 和 `ELEMENT` 共用版本体系

---

## 7.3 recipe_version_components

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

- 这是 V3-lite 的核心表
- 表达 recipe 对其他节点或 item 的依赖关系

---

## 8. JSON 结构建议

一期只保留两套 JSON：

- `element-record-v3-lite`
- `composite-record-v3-lite`

---

## 8.1 Element JSON

```json
{
  "meta": {
    "dish_code": "EL_CHICKEN_STOCK",
    "dish_name": "Chicken Stock",
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
  "ingredients": [
    { "name": "Chicken bones", "quantity": "5", "unit": "kg", "note": "" }
  ],
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

说明：

- `ELEMENT` 可以完全独立存在
- `component_refs` 可为空

---

## 8.2 Composite JSON

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

说明：

- `COMPOSITE` 只存 dish 层信息
- 子部件详细做法由 `ELEMENT` 自己负责
- 一期 schema 建议增加：`display_name`、`aliases`、`equipment`、`child_code`

---

## 9. Cookbook 导入模式

V3-lite 一期建议支持三类导入模式。

## 9.1 Components 模式

特征：

- 顶层 dish 标题
- `Components:`
- 后面列多个 component 名称

示例：

- `Lobster`

导入结果：

- 1 个 `COMPOSITE`
- 多个 `ELEMENT`

## 9.2 Section 模式

特征：

- 一个主标题
- 多个独立 section
- 最后有 `TO FINISH`

示例：

- `Tomato Salad with Basil and Shallot`

导入结果：

- 1 个 `COMPOSITE`
- 多个 `ELEMENT`
- `TO FINISH` 拆成 assembly layer

## 9.3 For-the-X 模式

特征：

- 顶部按 section 分 ingredient block
- 后文按 `FOR THE X` 写 method
- 最后 `TO COMPLETE`

示例：

- `Pan-Roasted Breast of Squab...`

导入结果：

- 1 个 `COMPOSITE`
- 多个 `ELEMENT`
- ingredient block 与 method block 对齐后生成子部件

---

## 10. 基础库导入规则

对于 `BASIC RECIPES` 这类文档：

- 不生成 `COMPOSITE`
- 直接生成多个 `ELEMENT`
- 默认 `business_type = BACKBONE`

例如：

- `Basic Sugar Syrup`
- `Chicken Stock`
- `Clarified Butter`

这样可以把基础库和菜单菜分开管理。

---

## 11. 一期业务规则

### 11.1 COMPOSITE 可以引用 ELEMENT

允许。

### 11.2 ELEMENT 可以引用 ELEMENT

允许，但一期只做基础支持，不做复杂图分析。

### 11.3 必须防循环引用

例如：

- A 不可引用 B，同时 B 又回指 A

### 11.4 发布时尽量绑定 child_version_id

如果 child 已存在发布版本，应绑定到具体 version。

### 11.5 FINISH_ITEM 允许没有步骤

例如：

- onion blossoms
- basil blooms

### 11.6 REFERENCE_PREP 可以先占位

例如：

- `Tomato Water (this page)`
- `Quick Squab Sauce (page 229)`

一期允许先以文本占位，后续再人工绑定已有 recipe。

---

## 12. 查看页建议

一期前端建议支持三种视图：

### 12.1 Composite 视图

展示：

- dish 信息
- assembly 组件
- assembly 步骤

### 12.2 Element 视图

展示：

- ingredients
- steps
- yield

### 12.3 结构视图

用简单分区展示：

- PREP
- INTERMEDIATE
- ASSEMBLY
- FINISH
- PLATING

一期不要求做复杂关系图。

---

## 13. 审批建议

一期审批粒度仍然按 `recipe_version`。

支持：

- 单个 `ELEMENT` 审批
- 单个 `COMPOSITE` 审批

如果一次导入整道菜，可以在 UI 上成组展示，但底层仍按 version 处理。

---

## 14. 一期不做的内容

以下内容保留到后续版本：

- `slot_code`
- `family_code`
- seasonal variant 自动切换
- library_scope
- resolution_status
- inline item 自动升格
- 复杂依赖图谱

这些后续是否需要，建议等真实录入几十道菜后再决定。

---

## 15. 当前结论

`V3-lite` 一期只需要把下面这些做好：

- `COMPOSITE`
- `ELEMENT`
- `RECIPE_REF / REFERENCE_PREP / RAW_ITEM / FINISH_ITEM`
- `recipes`
- `recipe_versions`
- `recipe_version_components`
- `TO FINISH` -> `assembly layer`
- cookbook 三类导入模式
- 基础库 recipe 独立导入

这已经足够支持你现在最真实的厨房研发和菜单数据库场景。

---

## 16. 下一步建议

如果确认采用 `V3-lite`，下一步建议输出两份内容：

1. 数据库迁移 SQL 草案
2. 前端页面改造方案

这样就可以进入实施阶段。
