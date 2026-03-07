# L0 入库重整执行看板（V2.5）

Last Updated: 2026-03-03

## 目标
在不改动现有审阅前端的前提下，建立稳定的 L0 批量入库流水线：
- 提取稳定
- 证据可追溯
- Draft 可审阅
- 低质量自动分流 Need-Evidence

## 流程
1. Source Ready
- 书籍 markdown 准备完成
- 章节行号范围确认

2. Extract (Qwen3.5)
- 按小 chunk 抽取 L0 候选
- 输出 `principles + non_l0_content`

3. Verify (规则二审)
- 规则校验：机理/参数/因果/证据/边界
- 不合格自动打回

4. Draft Ingest
- 合格候选写入 `l0_principles(status=DRAFT)`
- 证据写入 `l0_citations`

5. Human Review
- `/knowledge/l0/queue` 中审核
- 决策：approve / reject / need_evidence / publish

## 当前执行参数（首批建议）
- target_chars: 1800
- timeout_sec: 45
- retry: 1
- max_chunks: 8（McGee 前三章）
- submit_mode: sqlite（直写本地 Draft）

## 验收指标（Batch-1）
- API 成功 chunk 比例 >= 70%
- Draft 写入条数 >= 15
- 可追溯率（citation+locator+snippet）= 100%
- need_evidence 比例 <= 40%

## 异常处理
- 大面积 timeout：继续降 chunk 到 1200，timeout 到 35
- Draft=0：检查 sqlite 路径与表结构
- 重复 key：允许新版本，不覆盖历史

## 执行责任
- Codex：提取脚本执行、数据清洗、Draft 入库
- Jeff：审阅页审批与发布决策
