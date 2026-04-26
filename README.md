# 餐厅业务系统仓库

这是一个餐厅内部业务系统总仓库，当前主要包含两条已经成型的主线：

1. `order`：原有下单/门店运营主系统
2. `recipes`：新食谱系统（录入、查看、审批）

它们在**同一个仓库**里维护，但在**域名、进程、数据库、使用场景**上已经明确区分。

---

## 一、两个系统如何区分

### 1. 下单系统 `order`
用途：原有业务主系统，负责下单与既有门店流程。

当前正式入口：
- [https://order.jify.com.cn](https://order.jify.com.cn)

代码入口：
- [/Users/jeff/Documents/New project/app/order/page.tsx](/Users/jeff/Documents/New%20project/app/order/page.tsx)

特点：
- 这是旧主系统
- 继续独立运行
- 不和新食谱系统共用前端入口

### 2. 食谱系统 `recipes`
用途：食谱录入、子配方维护、整道菜查看、审批发布。

当前正式入口：
- [https://recipes.jify.com.cn/recipes](https://recipes.jify.com.cn/recipes)
- [https://recipes.jify.com.cn/recipes/view](https://recipes.jify.com.cn/recipes/view)
- [https://recipes.jify.com.cn/recipes/approvals](https://recipes.jify.com.cn/recipes/approvals)

代码入口：
- [/Users/jeff/Documents/New project/app/recipes/page.tsx](/Users/jeff/Documents/New%20project/app/recipes/page.tsx)
- [/Users/jeff/Documents/New project/app/recipes/view/page.tsx](/Users/jeff/Documents/New%20project/app/recipes/view/page.tsx)
- [/Users/jeff/Documents/New project/app/recipes/approvals/page.tsx](/Users/jeff/Documents/New%20project/app/recipes/approvals/page.tsx)

特点：
- 新系统
- 以 `V3-lite` 食谱模型为核心
- 包含 `ELEMENT` 和 `COMPOSITE`
- 已独立挂在新域名，不覆盖下单系统

---

## 二、为什么放在同一个仓库里

这是一个餐厅业务 `monorepo`，目的是把同一门店的核心系统放在一起维护：

```text
app/
├─ order/        下单系统
├─ recipes/      食谱系统
├─ foh/          前厅忌口查询
├─ receiving/    收货
├─ dashboard/    后台概览
├─ chatbot/      对话入口
├─ knowledge/    知识相关页面
└─ docs/         文档页
```

同仓库不等于同系统。

真正的隔离依赖于：
- 不同域名
- 不同 PM2 进程
- 不同数据库配置
- 不同页面入口

当前这几项已经做了隔离。

---

## 三、当前正式环境结构

### 正式环境

```text
正式食谱系统
├─ 域名: recipes.jify.com.cn
├─ 应用: BangWagon VPS
├─ 进程: PM2 / restaurant-daily-order
└─ 数据库: BangWagon 本机 PostgreSQL / restaurant_prod
```

### 原有下单系统

```text
原有下单系统
├─ 域名: order.jify.com.cn
├─ 应用: BangWagon VPS
└─ 进程: PM2 / ensue-order
```

### 当前运行时检查

查看：
- [https://recipes.jify.com.cn/api/runtime/status](https://recipes.jify.com.cn/api/runtime/status)

用于确认：
- 当前是否为持久数据库
- 当前数据库提供方
- 当前数据目录/连接来源

---

## 四、测试环境结构

当前建议结构：

```text
测试环境
├─ 前端/预览: Vercel
└─ 测试数据库: 外部 PostgreSQL（独立 test 库）
```

原则：
- **正式数据库不和测试数据库混用**
- 正式环境写入 `restaurant_prod`
- 测试环境必须连独立 test 数据库

注意：
- 当前 BangWagon 本机 PostgreSQL 主要承载正式库
- 测试库不建议继续压在 1G VPS 上

---

## 五、食谱系统的页面职责

当前食谱系统只保留 3 个主入口：

```text
食谱系统
├─ 录入工作台
├─ 查看菜谱
└─ 审批中心
```

### 1. 录入工作台
入口：
- [https://recipes.jify.com.cn/recipes](https://recipes.jify.com.cn/recipes)

职责：
- AI 导入食谱
- 修改子配方（Element）
- 组装整道菜（Composite）
- 提交审批

### 2. 查看菜谱
入口：
- [https://recipes.jify.com.cn/recipes/view](https://recipes.jify.com.cn/recipes/view)

职责：
- 厨房只读查看
- 搜菜式 / 搜子配方
- 看整道菜组成
- 看出品动作
- 点开子配方查看详细内容

### 3. 审批中心
入口：
- [https://recipes.jify.com.cn/recipes/approvals](https://recipes.jify.com.cn/recipes/approvals)

职责：
- 查看待审批记录
- 批量通过/驳回
- 待发布列表
- 发布正式版本

---

## 六、食谱数据模型（V3-lite）

核心结构：

```text
recipes
├─ ELEMENT     子配方/基础配方
└─ COMPOSITE   整道菜
```

业务分类：
- `BACKBONE`：基础母配方，长期复用
- `MENU`：菜单菜/季度菜

核心关系：
- `COMPOSITE` 可以引用多个 `ELEMENT`
- `ELEMENT` 也可以被其他 `ELEMENT` 引用
- 审批和发布都基于 `recipe_versions`

Schema 文件：
- [element-record-v3-lite.schema.json](/Users/jeff/Documents/New%20project/schemas/element-record-v3-lite.schema.json)
- [composite-record-v3-lite.schema.json](/Users/jeff/Documents/New%20project/schemas/composite-record-v3-lite.schema.json)

设计文档：
- [RECIPE_V3_PLAN.md](/Users/jeff/Documents/New%20project/RECIPE_V3_PLAN.md)
- [PROGRAM_MASTER_PLAN.md](/Users/jeff/Documents/New%20project/PROGRAM_MASTER_PLAN.md)

---

## 七、本地开发怎么跑

### 环境要求
- Node.js 20+
- npm

### 本地启动
1. 安装依赖
```bash
npm install
```

2. 复制环境变量模板
```bash
cp .env.example .env.local
```

3. 运行部署自检
```bash
npm run deploy:check
```

4. 启动开发
```bash
npm run dev
```

5. 打开常用页面
- [http://localhost:3000/order](http://localhost:3000/order)
- [http://localhost:3000/recipes](http://localhost:3000/recipes)
- [http://localhost:3000/recipes/view](http://localhost:3000/recipes/view)
- [http://localhost:3000/recipes/approvals](http://localhost:3000/recipes/approvals)
- [http://localhost:3000/foh](http://localhost:3000/foh)

---

## 八、本地数据存放位置

如果本地没有配置 `DATA_DIR`，默认数据目录是：
- [/Users/jeff/Documents/New project/data](/Users/jeff/Documents/New%20project/data)

常见本地数据库文件：
- [/Users/jeff/Documents/New project/data/app.db](/Users/jeff/Documents/New%20project/data/app.db)
- [/Users/jeff/Documents/New project/data/l0_engine.db](/Users/jeff/Documents/New%20project/data/l0_engine.db)

说明：
- `app.db`：本地业务 SQLite
- `l0_engine.db`：本地知识引擎 SQLite

注意：
- **正式环境已经不使用本地 `app.db`**
- 正式食谱系统已切到 BangWagon 本机 PostgreSQL

---

## 九、环境变量重点

### 食谱系统数据库
- `RECIPES_DB_PROVIDER`
- `DATABASE_URL`
- `POSTGRES_URL`
- `RECIPES_DB_FILE`
- `DATA_DIR`

### AI 导入
- `DASHSCOPE_API_KEY`
- 兼容：`DASHSCOPE_APIKEY`
- 兼容：`QWEN_API_KEY`

### 发布同步（可选）
- `BANGWAGONG_WEBHOOK_URL`
- `BANGWAGONG_API_TOKEN`
- `BANGWAGONG_WEBHOOK_TOKEN`

---

## 十、当前推荐的协作方式

### 开发/测试
- 在 Vercel 或本地先改和测
- 使用独立测试数据库
- 确认无误后再部署到 BangWagon 正式环境

### 正式发布
- `recipes.jify.com.cn` 只连正式数据库
- 不在正式库里跑测试数据
- 审批、发布在正式环境完成

---

## 十一、当前仓库的真实定位

这个仓库不是“只有 recipes 的仓库”。

它是一个餐厅业务总仓库，当前最重要的两条系统线是：
- `order`：门店旧主系统
- `recipes`：新食谱系统

以后如果继续拆分，也建议按“系统边界”拆，不按页面拆。

---

## 十二、快速入口

### 正式环境
- 下单系统：[https://order.jify.com.cn](https://order.jify.com.cn)
- 食谱录入：[https://recipes.jify.com.cn/recipes](https://recipes.jify.com.cn/recipes)
- 食谱查看：[https://recipes.jify.com.cn/recipes/view](https://recipes.jify.com.cn/recipes/view)
- 食谱审批：[https://recipes.jify.com.cn/recipes/approvals](https://recipes.jify.com.cn/recipes/approvals)
- 运行状态：[https://recipes.jify.com.cn/api/runtime/status](https://recipes.jify.com.cn/api/runtime/status)

### 本地开发
- [http://localhost:3000/order](http://localhost:3000/order)
- [http://localhost:3000/recipes](http://localhost:3000/recipes)
- [http://localhost:3000/recipes/view](http://localhost:3000/recipes/view)
- [http://localhost:3000/recipes/approvals](http://localhost:3000/recipes/approvals)

