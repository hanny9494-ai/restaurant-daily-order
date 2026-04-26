# 食谱系统自造样本测试包

日期：2026-03-21
用途：用于手工测试当前线上食谱系统的导入、查看、审批、发布链路。
线上地址：[https://restaurant-daily-order.vercel.app](https://restaurant-daily-order.vercel.app)

## 使用方式

1. 打开 [录入工作台](https://restaurant-daily-order.vercel.app/recipes)
2. 停留在 `导入`
3. 把下面任意一组样本文本直接粘贴进去
4. 点击 `解析文本`
5. 按当前测试文档继续走：
   - 改原料
   - 改步骤
   - 提交审批
   - 去审批中心通过/发布

---

## 样本 1：单个基础库 Element
用途：测试 `单个 Element` 的最短链路
预期：
- 识别成 `SINGLE_ELEMENT` 或单条 `ELEMENT`
- 可改原料和步骤
- 可直接提交审批

```text
BROWN BUTTER SAUCE
Butter 200g
Sage 20g
Salt 2g
Instruction:
Melt butter over medium heat until nutty brown. Add sage and salt. Strain and hold warm.
```

---

## 样本 2：多个基础库配方
用途：测试 `ELEMENT_LIBRARY`
预期：
- 一次识别出多条 backbone recipe
- 每条都能单独编辑

```text
BASIC RECIPES

BASIC SUGAR SYRUP
Sugar 500g
Water 500ml
Instruction:
Combine sugar and water. Bring to a boil. Cool and store.

CHICKEN STOCK
Chicken bones 5kg
Onion 2ea
Celery 2 stalks
Instruction:
Roast bones lightly. Add vegetables and water. Simmer 4 hours. Strain and chill.

CLARIFIED BUTTER
Butter 2kg
Instruction:
Melt gently. Skim impurities. Decant the clear butter.
```

---

## 样本 3：标准 Components 复合菜
用途：测试 `COMPOSITE + ELEMENT`
预期：
- 识别成一整道菜
- 拆出多个子配方
- `查看菜谱` 右侧可点子配方

```text
LOBSTER WITH PUMPKIN AND PEAR

Components:
- Lobster Brine
- Lobster Sauce
- Pumpkin Puree
- Pear Gel
- Pear Chips

Lobster Brine
Water 1000g
Salt 17g
Bay leaf 2pcs
Instruction:
Bring water and salt to a boil. Add bay leaf. Cool completely and brine the lobster.

Lobster Sauce
Chicken stock 500g
Lobster stock 500g
Butter 80g
Instruction:
Reduce both stocks by half. Whisk in butter. Season and hold warm.

Pumpkin Puree
Pumpkin 500g
Butter 20g
Instruction:
Roast pumpkin until tender. Blend with butter until smooth.

Pear Gel
Pear juice 200g
Agar 2g
Instruction:
Bring juice and agar to a boil. Set cold. Blend smooth.

Pear Chips
Pear 2ea
Instruction:
Slice thinly. Dehydrate until crisp.
```

---

## 样本 4：Cookbook 型复合菜
用途：测试 `TO FINISH` 是否不会误拆成 element
预期：
- `Bonito Bavarois` / `Corn Bavarois` 变成子配方
- `caviar` / `onion blossoms` 留在 finishing / refs 语义里

```text
CAVIAR WITH CORN AND BONITO
Serves 8

BONITO BAVAROIS
45 g bonito flakes
450 g cream
Instruction:
Infuse cream with bonito overnight. Strain. Fold with whipped cream and chill until set.

CORN BAVAROIS
350 g corn juice
120 g cream
Instruction:
Reduce corn juice. Fold with whipped cream. Chill until set.

TO FINISH
56 g caviar
Onion blossoms
Instruction:
Quenelle both bavarois on the plate. Add caviar. Garnish with onion blossoms.
```

---

## 样本 5：菜单菜 + 明显 garnish / plating
用途：测试 `组装菜式` 心智是否清晰
预期：
- 可把核心子配方识别出来
- garnish 项不至于全部升格为独立复杂配方

```text
TOMATO SALAD WITH BASIL AND SHALLOT

TOMATO SAUCE
Tomato water 500g
Basil 10g
Instruction:
Infuse tomato water with basil. Blend and strain.

TOMATO BAVAROIS
Tomato water 300g
Cream 300g
Instruction:
Reduce tomato water, fold with whipped cream, and chill.

RYE CROUTONS
Rye bread 100g
Butter 20g
Instruction:
Toast rye bread with butter until crisp.

TO FINISH
Basil tips
Basil blooms
Cracked black pepper
Instruction:
Pipe bavarois, top with tomato salad, garnish with basil and cracked pepper.
```

---

## 样本 6：非标准 bullet 文本
用途：测试 parser 对脏文本的容忍度
预期：
- 至少能识别出 2 到 3 条 element
- 原料/步骤不应只剩标题

```text
Dish: Spring Herb Plate

• Herb Oil
Parsley 100g
Olive oil 300g
Instruction:
Blend parsley with warm oil. Strain.

• Lemon Cream
Cream 250g
Lemon juice 30g
Instruction:
Whisk lemon juice into cream and chill.

• Crunch
Bread crumbs 150g
Butter 40g
Instruction:
Toast until golden.
```

---

## 样本 7：子配方修改专用
用途：先导入，再去 `修改子配方` 模式测试抽屉可读性
预期：
- 打开抽屉后可以清楚分辨：名称 / 备注 / 数量 / 单位

```text
FERMENTED CABBAGE
Cabbage 1000g
Champagne vinegar 120g
White wine 80g
Sugar 20g
Kosher salt 18g
Instruction:
Combine cabbage, vinegar, wine, sugar, and salt. Press overnight. Hold cold for service.
```

---

## 样本 8：最短菜单组合测试
用途：用于 `组装菜式`
预期：
- 先录入 2 到 3 个 element 后
- 在组装菜式里搜索并加入
- 右侧固定显示已加入项

建议先录入这 3 个 element：

```text
YUZU CURD
Yuzu juice 200g
Egg yolk 120g
Butter 180g
Instruction:
Cook gently until thick. Blend smooth.
```

```text
PRAWN TARTARE
Sweet prawn 300g
Chive 10g
Olive oil 20g
Instruction:
Dice prawn. Fold with chive and oil. Keep cold.
```

```text
LOTUS TART SHELL
Lotus root 2ea
Oil 500ml
Instruction:
Slice lotus root thinly. Fry until crisp.
```

然后到 `组装菜式`，创建：
- `柚子甜虾塔`
- 加入上面 3 个子配方
- 补充项里写：`Yuzu zest`、`Micro shiso`
- 出品动作里写 1-2 行

---

## 推荐测试顺序

### 第一轮：确认主链是否通
1. 样本 1
2. 样本 2
3. 样本 3

### 第二轮：确认复合菜边界是否合理
4. 样本 4
5. 样本 5
6. 样本 6

### 第三轮：确认编辑与组装工作流
7. 样本 7
8. 样本 8

---

## 每组样本都要检查的点

1. 导入后是否有结果卡片
2. 点 `原料` 是否能打开原料抽屉
3. 点 `步骤` 是否能打开步骤抽屉
4. 修改后返回是否还在当前导入任务上下文
5. 提交审批后是否能在审批中心看见
6. 审批通过后是否进入待发布
7. 发布后查看页是否能正常显示
8. 如果是 Composite，右侧组成里的子配方是否能点开

---

## 当前最值得重点盯的风险

1. 自由格式文本是否会只生成标题
2. Cookbook 里的 `TO FINISH` 是否误拆成 element
3. 查看菜谱里子配方跳转是否稳定
4. 手机端查看页和抽屉是否仍有布局问题

