# 厨艺 AI 项目 — 完整项目记录
> 最后更新：2026-02-22
> 项目负责人：Jeff
> 硬件：Mac Studio M4 Max（16核CPU / 40核GPU / 128GB RAM）

---

## 一、项目核心目标

构建一个能像主厨一样思考菜品研发过程的 AI 系统。

**不是什么：** 问答机器人、食谱生成器、营养计算器
**是什么：** 陪主厨把一道菜从模糊概念一步步发展成完整实现方案的思维伙伴

### 核心能力：感官语言 ↔ 技术语言双向翻译

主厨说：「我想要那种入口即化但有一瞬间阻力的感觉」
机器人说：「那是明胶在15–18°C的状态——唇齿轻压时有一秒钟的弹性阻力，然后干净地融化，不留任何胶质在口腔里拖拽。琼脂做不到这个，它是脆断的。」

---

## 二、系统环境

| 项目 | 值 |
|---|---|
| 硬件 | Mac Studio M4 Max 128GB |
| Dify | 1.13.0 本地部署，http://localhost |
| Dify 工作目录 | `~/culinary-ai` |
| Ollama 地址 | `192.168.18.127:11434`（需 OLLAMA_HOST=0.0.0.0） |
| Conda 环境 | `paddleocr` |

### 开机命令（每次重启必跑）
```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve   # 后台挂起用 &
cd ~/culinary-ai && docker compose up -d
conda activate paddleocr
```

### 本地模型
| 模型 | 用途 |
|---|---|
| `qwen2.5:7b` | 阶段分类器（轻量快速）|
| `qwen2.5:14b` | 备用对话（本地，省 API）|
| `qwen2.5:32b` | 高质量本地推理 |
| `qwen3-embedding:8b` | 知识库向量化（MTEB 多语言第一）|
| `nomic-embed-text-v2-moe` | 备用 embedding |

### API 模型
| 模型 | Provider | 用途 |
|---|---|---|
| `qwen3.5-plus` | openai_api_compatible | 研发机器人主 LLM |

---

## 三、知识库架构（6个）

| 知识库名 | UUID | Dify 内部加密 ID | 内容 |
|---|---|---|---|
| culinary_science | 3631868e-8c7c-4591-ba39-ac34a3537329 | 0pivjXtVPVv3TxGcYoGH... | 烹饪科学原理 |
| culinary_techniques | 112db4ec-4909-4840-8c7e-716ec2591196 | 80q9cazO8kn2i8SynLb9... | 技法 |
| culinary_recipes | de7acc88-a287-4e01-8b77-d80b91a18650 | 6eaY1W++KRcSxw0/bcUP... | 食谱 |
| culinary_ingredients | 1cce4145-f135-4d8f-9217-6d7bc47f2e66 | mDbQs6gt6PVBEW+H4ZnI... | 食材特性 |
| sensory_language | 9d0c25e9-8851-49e7-b89c-4903e2a1b8b9 | JpRPCe7lvCxxYxfoeDdW... | 感官语言三语 |
| chefs_notes | f857394c-d367-4e45-8660-dc64128e6c2a | — | 主厨私人笔记 |

> ⚠️ DSL 里必须用 Dify 内部加密 ID，不是 UUID。从导出的 DSL 文件里拿。

### 知识库内容状态

**culinary_science：** Modernist Cuisine Vol.1-4, On Food and Cooking, Neurogastronomy 等
**culinary_techniques：** Professional Chef, Sous Vide, Jacques Pepin, Ratio, Sauces 等
**culinary_recipes：** French Laundry, Manresa, Alinea, Noma 2.0, EMP, Momofuku 等
**culinary_ingredients：** Salt Fat Acid Heat, Flavor Bible, Flavor Thesaurus, Koji Alchemy 等
**sensory_language（7个文件，2026-02-21完成上传）：**
- `michelin_inspector_dishes_2025.md` (EN)
- `jay_rayner_sensory_language.md` (EN)
- `toba_shusaku_ryori_philosophy.md` (JA)
- `rosanjin_food_philosophy.md` (JA)
- `dancyu_chef_sensory_language.md` (JA)
- `michelin_zh_sensory_2025.md` (ZH)
- `chinese_food_documentary_narration.md` (ZH)

---

## 四、书库转换状态

### 已完成
| 书名 | 引擎 |
|---|---|
| Modernist Cuisine Vol.1-4 | EPUB / MinerU |
| The Professional Chef 9th | MinerU |
| French Laundry | PaddleOCR |
| Alinea | MinerU |
| Core - Clare Smyth | MinerU |
| Neurogastronomy | MinerU |
| Momofuku | EPUB |
| Baltic | pymupdf4llm |
| salt-fat-acid-heat | pymupdf4llm |
| Japanese Cooking - Tsuji | pymupdf4llm |
| Charcuterie - Ruhlman | pymupdf4llm |
| Eleven Madison Park | pymupdf4llm |
| 全部 EPUB 28本 | BeautifulSoup |
| 冰淇淋风味学 | PaddleOCR |

### 需质检 / 考虑重跑
| 书名 | 状态 |
|---|---|
| Manresa | PaddleOCR → 考虑 MinerU 重跑 |
| Organum | PaddleOCR → 考虑 MinerU 重跑 |
| Cooking Sous Vide | PaddleOCR → 考虑 MinerU 重跑 |
| Noma 2.0 | PaddleOCR → 考虑 MinerU 重跑 |

### 转换原则
- 扫描 PDF → 一律走 **MinerU**（VLM 处理，质量远超 PaddleOCR）
- 数字 PDF → pymupdf4llm 或 PaddleOCR
- MinerU 每天 2000 页免费额度

---

## 五、研发思维机器人

### 六阶段研发框架

```
阶段1：结构解析    → 组成部分、质地排序、进食顺序、温度分布
阶段2：风味框架    → 主角食材、配角、张力、禁忌
阶段3：科学决策    → 稳定剂、氨基酸协同、热敏食材时机、pH
阶段4：技法实现    → 具体步骤、参数、时间温度比例
阶段5：感官语言    → 菜单描述、服务员语言、感官弧线
阶段6：完成总结    → 输出完整研发方案
```

### 当前运行版本：v7（已跑通）

**架构：**
```
Start → 阶段分类器(qwen2.5:7b) → KB科学+食材  ↘
                               → KB技法+感官 → 主LLM(qwen3.5-plus) → Answer
```

**DSL 文件：** `/mnt/user-data/outputs/culinary_rd_bot_v7.yml`
**API Key：** app-IruYbBSarGp8Eyqbt9s6QNAN

**v7 验证结果（2026-02-22）：**
- ✅ 7b 分类器正常运行，1秒内输出阶段数字
- ✅ 两组 KB 检索正常，有真实内容返回
- ✅ qwen3.5-plus 正常调用，输出质量高
- ⚠️ 7b 把首条消息判断为阶段3（待修复）

### DSL 版本历史

| 版本 | 状态 | 失败原因 |
|---|---|---|
| v1 | ❌ 崩溃 | version 0.1.3 错误 + if-else 路由太脆 |
| v2 | ❌ 报错 | KB 节点 retrieval_mode 字段位置错 |
| v3 | ❌ 报错 | 同上 |
| v3_nokb | ⚠️ 部分可用 | 无 KB，仅 LLM |
| v4 | ❌ LLM 不调用 | 节点 ID 有连字符，变量引用失败 |
| v5 | ❌ LLM 不调用 | provider 名写错（tongyi vs openai_api_compatible）|
| v6 | ❌ Ollama 连不上 | 缺少 OLLAMA_HOST=0.0.0.0 |
| **v7** | **✅ 跑通** | 从真实导出 DSL 拿到正确格式 |

---

## 六、Dify DSL 正确格式（关键）

```yaml
version: 0.6.0   # 必须是 0.6.0

dependencies:
- type: marketplace
  value:
    marketplace_plugin_unique_identifier: langgenius/ollama:0.1.2@fcf107...
- type: marketplace
  value:
    marketplace_plugin_unique_identifier: langgenius/openai_api_compatible:0.0.35@bb81...

# KB 节点
data:
  dataset_ids:                          # 顶层，用加密 ID（从导出 DSL 拿）
    - 0pivjXtVPVv3TxGcYoGH...
  retrieval_mode: multiple             # 顶层，不是嵌套在 dataset_configs
  multiple_retrieval_config:
    top_k: 4
    ...

# Ollama LLM
model:
  name: qwen2.5:7b
  provider: langgenius/ollama/ollama

# API LLM
model:
  name: qwen3.5-plus
  provider: langgenius/openai_api_compatible/openai_api_compatible

# 节点 ID：纯字母数字，无连字符
id: start1    # ✅
id: kb1       # ✅
id: llm1      # ✅
```

---

## 七、调试流程（必读）

### 绝对不要做的事
- 在 Dify 界面 Preview 盲等几分钟
- 猜测哪里出问题反复修改

### 正确调试步骤

**Step 1: 确认服务**
```bash
curl http://192.168.18.127:11434/api/tags      # Ollama
curl http://localhost/v1/info \
  -H "Authorization: Bearer YOUR_KEY"          # Dify
```

**Step 2: Streaming API 实时看节点**
```bash
curl -X POST http://localhost/v1/chat-messages \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"inputs":{},"query":"测试","response_mode":"streaming","conversation_id":"","user":"debug"}' \
  --no-buffer 2>&1 | grep -E '"title"|"status"|"error"|"text"' | head -30
```

**Step 3: 判断节点状态**
- `"status":"succeeded"` = 正常
- `"status":"failed"` + `"error":` = 找到问题
- LLM 节点 `elapsed_time < 1秒` = 模型没被调用，检查 provider/model 名字

**Step 4: 完整 debug 脚本**
```bash
python3 ~/Downloads/dify_debug.py "你的测试问题"
```

---

## 八、已知问题与待办

### P1 — 7b 阶段判断偏激进
- 症状：首条消息「我想做海胆杏仁豆腐澄清鸡汤冻」被判为阶段3
- 修复：classifier system prompt 加「dialogue_count=1 时强制输出1」

### P2 — 跨语言检索弱
- 症状：中文提问无法检索英文 KB 内容
- 根因：qwen3-embedding:8b 跨语言向量空间距离大
- 方案A：换 multilingual-e5-large（根治，需重新索引）
- 方案B：加 Query Rewriting 节点（快速修复）

### P3 — Ollama 开机未固化
- 问题：每次重启需手动跑 `OLLAMA_HOST=0.0.0.0:11434 ollama serve`
- 建议：加入 launchd 服务自动启动

### P4 — culinary_science Vol.1 OCR 噪声
- 症状：前62行是垃圾，后段有孤立页码
- 修复：清理后重新上传

### P5 — 14b 未被使用
- 当前 v7 只用了 7b（分类）+ qwen3.5-plus（主对话）
- 14b 可以接管阶段1-2 对话（本地，省 API 费用）
- 需要 if-else 路由才能实现，待 v8

---

## 九、API Keys

| 用途 | Key |
|---|---|
| 研发机器人 v7 | `<from env / Dify App API Access>` |
| Dataset 上传 | `<from env / Dify Dataset API>` |
| MinerU | 存于 ~/.zshrc |

> 安全规则：本文档不再存储明文 Key。若历史版本已暴露，需立即轮换。

---

## 十、工作脚本

| 脚本 | 用途 |
|---|---|
| `scan_books.py` | 质检，转换完必跑 |
| `batch_convert.py` | PaddleOCR 批量转换 |
| `mineru_convert.py` | MinerU 云端转换 |
| `upload_books.py` | 批量上传 Dify |
| `notes-sync.py` | Apple Notes 自动同步 |
| `dify_debug.py` | Dify workflow 调试工具 |

---

## 十一、参考文档索引

| 文档 | 路径 | 内容 |
|---|---|---|
| 本文件 | `/mnt/user-data/outputs/HANDOVER_COMPLETE.md` | 完整项目记录 |
| DSL 调试经验 | `/mnt/user-data/outputs/HANDOVER_DIFY_DSL_DEBUGGING.md` | DSL 失败原因 + 调试流程 |
| 当前 DSL | `/mnt/user-data/outputs/culinary_rd_bot_v7.yml` | 已跑通的 v7 |
| Debug 脚本 | `/mnt/user-data/outputs/dify_debug.py` | Streaming API 调试工具 |
| 旧 Handover | `/mnt/user-data/uploads/HANDOVER_MASTER_2.md` | 截止 2026-02-21 |

---

## 十二、历史归纳（仅保留有价值结论）

### 1) 文档去重结论
- `HANDOVER_MASTER.md`、`HANDOVER_MASTER_1.md`、`HANDOVER_MASTER_2.md` 内容一致，视为同一版本。
- 后续只维护主文档，不再并行维护多个 master 副本。

### 2) 演进里程碑
- 2026-02-20：以 OCR / MinerU / 上传 Dify 流水线为核心。
- 2026-02-21：完成 `sensory_language` 第一批三语内容；确立“知识密度优先”策略。
- 2026-02-21 晚：明确“研发思维机器人”作为唯一核心目标。
- 2026-02-22：v7 跑通，DSL 正确格式与调试流程沉淀完成（当前权威状态）。

### 3) 历史冲突统一口径（避免后续混乱）
- `sensory_language` 上传状态：以 2026-02-22 版本为准，视为已上传完成。
- 主 API 模型命名：统一为 `qwen3.5-plus`（provider: `openai_api_compatible`）。
- Ollama 地址：服务监听 `0.0.0.0:11434`，Dify 配置可访问地址（当前 `192.168.18.127:11434`）。

### 4) 当前遗留重点（只保留高价值）
- P1：7b 首轮阶段判断偏激进（首条输入误判阶段3）。
- P2：跨语言检索弱（中问英检索命中不足）。
- P3：Ollama 开机自启动未固化。
- P4：部分 OCR 噪声文本待清理重传。
- P5：14b 未纳入正式分阶段路由（成本优化未落地）。

---

## 十三、文档治理规则（从本次起生效）

1. `HANDOVER_COMPLETE.md` 为唯一长期主档；历史文档只归档不继续更新。  
2. 每次会话结束只做“增量追加”：更新完成项、未完成项、下一步，不重写历史。  
3. 新会话统一从 `LIVE_CONTEXT.md` 进入；结束必须产出 session markdown。  
4. 禁止在文档中写入明文密钥。  
