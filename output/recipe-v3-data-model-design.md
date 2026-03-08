# 餐厅食谱系统 V3 数据模型设计文档

## 1. 目标

V3 的目标不是继续扩展单条 recipe 的 JSON，而是把“整道菜”和“子部件”彻底分层，支持复合菜、可复用 element、外部 prep 引用、finish item、版本绑定和依赖追踪。

适用场景：

- 一本 cookbook 里，一道菜由多个 components 组成
- 同一道菜里同时存在 sauce、puree、gel、stock、garnish、plating item
- 某些 component 会被其他 component 继续引用
- 某些 prep 在当前文档中没有展开，只写成 `this page` 或其他引用
- 厨房需要按 element 检索、按主菜查看、按版本审批

---

## 2. V2 的核心问题

V2 的 `recipe-record-v2` 适合单一配方，不适合真实的复合菜生产结构。

主要限制：

- 一道菜只能表达成一条扁平 recipe
- 子部件无法独立版本化
- sauce 改版后无法准确追踪影响哪些主菜
- garnish / plating element 要么被误当 recipe，要么丢失
- `TO FINISH` 无法准确表达成 assembly layer
- 同一页内和跨页 prep 的依赖关系无法建模

因此 V3 需要从“单记录模型”升级为“版本化节点 + 依赖图模型”。

---

## 3. V3 设计原则

### 3.1 实体分层

V3 只保留两类真正可版本化的 recipe 实体：

- `COMPOSITE`
- `ELEMENT`

说明：

- `COMPOSITE` 表示整道菜
- `ELEMENT` 表示可独立制作、可复用、可审批的子配方

### 3.2 依赖项不是都要变成 recipe

不是所有出现在一道菜中的东西都要建成独立 recipe。

V3 的依赖项支持四类：

- `RECIPE_REF`
- `REFERENCE_PREP`
- `RAW_ITEM`
- `FINISH_ITEM`

说明：

- `RECIPE_REF`：引用系统中已有的 recipe version
- `REFERENCE_PREP`：文档里被引用，但当前未展开正文的 prep
- `RAW_ITEM`：直接参与组合的原料或成品原料
- `FINISH_ITEM`：装盘、点缀、出品时直接使用的 item

### 3.3 TO FINISH 不是 recipe

`TO FINISH` 在 V3 中不生成新的 recipe。

它应该拆成：

- `assembly_components`
- `assembly_steps`

### 3.4 必须绑定子版本

`COMPOSITE` 或 `ELEMENT` 引用子 recipe 时，必须绑定到具体 `child_version_id`，不能只绑定 `child_recipe_id`。

原因：

- 否则子 recipe 升级会隐式改变历史已发布主菜
- 厨房无法保证出品可追溯

### 3.5 结构是 DAG，不是纯树

V3 允许：

- `COMPOSITE -> ELEMENT`
- `ELEMENT -> ELEMENT`

例如：

- `Poached Lobster -> Meyer Lemon Beurre Blanc`
- `Tomato Salad -> Pickled Tomato`
- `Tomato Sauce -> Tomato Water`

但必须禁止循环引用。

---

## 4. 核心概念定义

### 4.1 Recipe Entity

系统中可独立版本化、可审批、可检索的节点。

分为：

- `COMPOSITE`
- `ELEMENT`

### 4.2 Composite

表示整道菜或整道菜单项。

特点：

- 有 dish 级元信息
- 有 assembly / plating 逻辑
- 引用多个 child component
- 通常对应菜单上的一道菜

### 4.3 Element

表示可独立制作、可复用、可审批的 preparation。

例如：

- `Lobster Sauce`
- `Tomato Bavarois`
- `Rye Croutons`
- `Meyer Lemon Beurre Blanc`
- `Chicken Stock`

### 4.4 Component Link

表示某个 recipe version 对另一个节点或 item 的引用关系。

类型：

- `RECIPE_REF`
- `REFERENCE_PREP`
- `RAW_ITEM`
- `FINISH_ITEM`

---

## 5. 业务维度定义

### 5.1 entity_kind

- `COMPOSITE`
- `ELEMENT`

### 5.2 business_type

- `MENU`
- `BACKBONE`

示例：

- `Lobster`：`COMPOSITE + MENU`
- `Lobster Sauce`：`ELEMENT + MENU`
- `Chicken Stock`：`ELEMENT + BACKBONE`

### 5.3 technique_family

用于描述 element 本身属于哪类 preparation。

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
- `DOUGH`
- `OIL`
- `OTHER`

### 5.4 component_role

用于描述子部件在整道菜中的作用。

建议枚举：

- `PROTEIN`
- `BODY`
- `BASE`
- `SAUCE`
- `TEXTURE`
- `ACID`
- `AROMATIC`
- `GARNISH`
- `PLATING`
- `FINISH`
- `OTHER`

### 5.5 section

用于描述该 component 所处工序层。

建议枚举：

- `PREP`
- `INTERMEDIATE`
- `ASSEMBLY`
- `FINISH`
- `PLATING`

---

## 6. 数据库设计

## 6.1 表：recipes

用途：

- 记录 recipe 主实体
- 一个实体可以是 `COMPOSITE` 或 `ELEMENT`

建议结构：

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

- `technique_family` 对 `COMPOSITE` 可为空
- `code` 继续作为系统稳定编码

---

## 6.2 表：recipe_versions

用途：

- 记录 recipe 的版本数据
- 所有 JSON 结构落在这里

建议结构：

```sql
CREATE TABLE recipe_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED')),
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

- `record_json` 存具体版本结构
- `COMPOSITE` 和 `ELEMENT` 都共用这张表

---

## 6.3 表：recipe_version_components

用途：

- 记录某个 recipe version 依赖哪些 child component
- 这是 V3 的核心表

建议结构：

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

字段说明：

- `parent_version_id`：当前 version
- `component_kind`：依赖类型
- `child_recipe_id`：当 `component_kind = RECIPE_REF` 时使用
- `child_version_id`：绑定具体子版本
- `display_name`：界面展示名
- `component_role`：功能角色
- `section`：工序层
- `quantity/unit`：在主菜层或 element 层引用时的数量
- `source_ref`：例如 `this page`
- `prep_note`：例如 `reserved for plating`

---

## 6.4 可选表：recipe_import_batches

用途：

- 一次导入一整组复合菜时归档来源
- 便于成组审批、成组回查

建议结构：

```sql
CREATE TABLE recipe_import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_code TEXT NOT NULL UNIQUE,
  source_file_name TEXT,
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

说明：

- 初版可不做
- 若以后经常整本 cookbook 或整道复合菜成组导入，建议启用

---

## 7. JSON 结构设计

V3 不建议强制 `COMPOSITE` 和 `ELEMENT` 共用完全一致的 JSON。

建议分为两类 schema：

- `element-record-v3`
- `composite-record-v3`

---

## 7.1 Element JSON

适用：

- sauce
- puree
- gel
- stock
- bavarois
- tart
- poached protein

建议结构：

```json
{
  "meta": {
    "dish_code": "EL_LOBSTER_BISQUE_SAUCE",
    "dish_name": "Lobster Bisque Sauce",
    "entity_kind": "ELEMENT",
    "business_type": "MENU",
    "technique_family": "SAUCE",
    "menu_cycle": "2026_SUMMER",
    "plating_image_url": ""
  },
  "production": {
    "yield": "warm sauce for 8 portions",
    "net_yield_rate": 1,
    "key_temperature_points": []
  },
  "allergens": [],
  "ingredients": [
    { "name": "Lobster Stock", "quantity": "4", "unit": "kg", "note": "this page" }
  ],
  "steps": [
    { "step_no": 1, "action": "Bring the lobster stock to a simmer.", "time_sec": 0 }
  ],
  "component_refs": [
    {
      "component_kind": "RECIPE_REF",
      "ref_name": "Lobster Stock",
      "component_role": "BASE",
      "section": "PREP",
      "quantity": "4",
      "unit": "kg",
      "source_ref": "this page"
    }
  ]
}
```

说明：

- `component_refs` 用于表达 element 对其他 recipe 的依赖
- `ingredients` 仍保留，方便厨房实际操作和 FOH 展开

---

## 7.2 Composite JSON

适用：

- 菜单上的整道菜

建议结构：

```json
{
  "meta": {
    "dish_code": "MENU_LOBSTER_CHANTERELLE_POTATO",
    "dish_name": "Lobster Poached with Chanterelles and Potato",
    "entity_kind": "COMPOSITE",
    "business_type": "MENU",
    "menu_cycle": "2026_SUMMER",
    "plating_image_url": ""
  },
  "production": {
    "serves": "8"
  },
  "assembly_components": [
    {
      "component_kind": "RECIPE_REF",
      "ref_name": "Chanterelle Potato Tart",
      "component_role": "BODY",
      "section": "ASSEMBLY",
      "quantity": "8",
      "unit": "pcs",
      "sort_order": 1
    },
    {
      "component_kind": "RECIPE_REF",
      "ref_name": "Poached Lobster",
      "component_role": "PROTEIN",
      "section": "ASSEMBLY",
      "quantity": "8",
      "unit": "tail halves",
      "sort_order": 2
    },
    {
      "component_kind": "RECIPE_REF",
      "ref_name": "Lobster Bisque Sauce",
      "component_role": "SAUCE",
      "section": "FINISH",
      "sort_order": 3
    },
    {
      "component_kind": "REFERENCE_PREP",
      "ref_name": "Mushroom Crumble",
      "component_role": "TEXTURE",
      "section": "FINISH",
      "sort_order": 4,
      "source_ref": "this page"
    },
    {
      "component_kind": "RAW_ITEM",
      "ref_name": "Olive oil",
      "component_role": "FINISH",
      "section": "PLATING",
      "quantity": "20",
      "unit": "g",
      "sort_order": 5
    }
  ],
  "assembly_steps": [
    {
      "step_no": 1,
      "action": "Place 1 potato tart slightly to the right of center on each plate."
    },
    {
      "step_no": 2,
      "action": "Place 1 lobster tail half alongside each tart."
    },
    {
      "step_no": 3,
      "action": "Sauce each plate with the lobster bisque sauce."
    },
    {
      "step_no": 4,
      "action": "Break the sauce with olive oil to finish."
    }
  ],
  "service_notes": {
    "plating_notes": "",
    "pass_notes": ""
  }
}
```

---

## 8. 样本映射原则

本设计基于以下 cookbook 风格样本抽象：

- `Caviar with Corn and Bonito`
- `Tomato Salad with Basil and Shallot`
- `Lobster Poached with Chanterelles and Potato`

### 8.1 Caviar with Corn and Bonito

主菜：

- `Caviar with Corn and Bonito` -> `COMPOSITE`

Element：

- `Bonito Bavarois`
- `Corn Bavarois`

Finish item：

- `Caviar`
- `Onion blossoms`

### 8.2 Tomato Salad with Basil and Shallot

主菜：

- `Tomato Salad with Basil and Shallot` -> `COMPOSITE`

Element：

- `Crushed Tomatoes`
- `Tomato Sauce`
- `Tomato Bavarois`
- `Rye Croutons`
- `Pickled Tomato`
- `Tomato Salad`
- `Pickled Shallots`

Reference prep：

- `Tomato Water`
- `Basil Pickling Liquid`
- `White Wine Pickling Liquid`

Finish item：

- `Cracked black pepper`
- `Bush basil tips`
- `Basil blooms`

### 8.3 Lobster Poached with Chanterelles and Potato

主菜：

- `Lobster Poached with Chanterelles and Potato`

Element：

- `Chanterelle Potato Tart`
- `Lobster Bisque Sauce`
- `Meyer Lemon Beurre Blanc`
- `Poached Lobster`

Reference prep：

- `Mushroom Brown Butter`
- `Chanterelle Puree`
- `Lobster Stock`
- `Mushroom Crumble`

说明：

- `Poached Lobster` 依赖 `Meyer Lemon Beurre Blanc`
- 因此 V3 必须支持 `ELEMENT -> ELEMENT`

---

## 9. 关键业务规则

### 9.1 Composite 必须通过 components 引用 child

`COMPOSITE` 本身不复制 child 的完整工艺内容。

### 9.2 Element 可以引用 Element

允许多层依赖，但必须：

- 防循环引用
- 限制最大深度

建议：

- 最大深度 `3`

### 9.3 Published parent 必须绑定 published child_version_id

若 child version 未发布，不允许 parent version 发布。

### 9.4 BACKBONE element 可以被 MENU 复用

例如：

- `Chicken Stock`
- `Lobster Stock`
- `Pickling Liquid`

### 9.5 Finish item 允许无步骤

例如：

- `onion blossoms`
- `basil blooms`
- `cracked black pepper`

它们不强制建 recipe。

### 9.6 Garnish / plating 允许缺少完整工艺

但应保留自动或人工标签：

- `GARNISH`
- `PLATING`

### 9.7 Serves 只挂主菜

`Serves 8` 一般属于 `COMPOSITE`。

Element 更适合用：

- `yield`
- `batch_size`
- `portions_supported`

---

## 10. 导入策略建议

V3 导入时，不应直接把整份文档解析成扁平 recipes 数组。

建议流程：

### Step 1：识别顶层主菜

先识别：

- 顶层标题
- `Serves`

生成一个 `COMPOSITE draft`

### Step 2：识别 section 列表

识别独立 section：

- `BONITO BAVAROIS`
- `TOMATO SAUCE`
- `POACHED LOBSTER`

这些生成 `ELEMENT draft`

### Step 3：抽取引用关系

在每个 section 内识别：

- 是否引用了其他 recipe
- 是否引用了 `this page`
- 是否只是 raw item / finish item

### Step 4：抽取 TO FINISH

将 `TO FINISH` 拆成：

- `assembly_components`
- `assembly_steps`

### Step 5：人工审核

审核内容：

- 顶层主菜识别是否正确
- 哪些 section 是 element
- 哪些 item 只是 finish item
- 哪些外部 prep 应链接到已有 recipe

---

## 11. 查看页建议

V3 查看页建议提供三种视图：

### 11.1 Composite 视图

展示：

- 主菜信息
- assembly steps
- 所有关联 components

### 11.2 Element 视图

展示：

- 独立 element 的 ingredients / steps / yield

### 11.3 Dependency 视图

展示：

- 当前菜依赖了哪些 elements
- 当前 element 又依赖了哪些 prep

适合做成树状或层级列表。

---

## 12. 审批建议

审批粒度建议仍以 `recipe_version` 为单位。

但界面上可以支持两种模式：

### 12.1 单条审批

- 审批单个 `ELEMENT`
- 审批单个 `COMPOSITE`

### 12.2 Batch 审批

一次导入一整道复合菜时：

- 一起展示主菜和所有子 element
- 支持成组审核

---

## 13. FOH / 忌口扩展价值

V3 对前厅忌口识别会更强，因为：

- 可以从 `COMPOSITE` 展开到所有 child element
- 可以从 child element 再展开到底层 ingredients
- 可以更准确判断某道菜中的致敏源、动物性成分、辛辣、酒精等

这比只看主菜扁平 ingredients 更准确。

---

## 14. 建议的实施顺序

建议按下面顺序推进：

### Phase 1：定模型

- 确认 `COMPOSITE` / `ELEMENT`
- 确认 `component_kind`
- 确认 `section`
- 确认 `component_role`
- 确认 `technique_family`

### Phase 2：数据库迁移

- 升级 `recipes`
- 升级 `recipe_versions`
- 新建 `recipe_version_components`

### Phase 3：导入逻辑

- 顶层主菜识别
- section -> element 拆分
- 引用关系抽取
- TO FINISH 抽取

### Phase 4：查看与审批

- Composite 视图
- Element 视图
- Dependency 视图
- Batch 审批

---

## 15. 当前建议结论

V3 的正式方向应为：

- 底层以 `COMPOSITE + ELEMENT + VERSION + COMPONENT LINKS` 为核心
- 依赖项支持 `RECIPE_REF / REFERENCE_PREP / RAW_ITEM / FINISH_ITEM`
- 主菜和子部件彻底分层
- 允许 element 之间继续引用
- 强制版本绑定，保证厨房出品可追溯

这个模型足够支撑：

- cookbook 导入
- 餐厅研发数据库
- 厨房生产查看
- 审批流程
- 后续 FOH 忌口分析
- 后续成本与库存映射

---

## 16. 下一步建议

在正式写代码前，建议继续确认三项：

1. `component_role` 最终枚举
2. `technique_family` 最终枚举
3. `REFERENCE_PREP` 在导入时是否允许先占位，后续再人工绑定已有 element

如果以上三项确认，V3 可以进入数据库迁移设计阶段。
