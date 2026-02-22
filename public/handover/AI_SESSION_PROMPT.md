# 新对话标准 Prompt（直接复制）

请先阅读并严格基于以下文档继续执行，不要重复询问已存在背景：
1. `handover/LIVE_CONTEXT.md`
2. `handover/HANDOVER_COMPLETE_FRAMEWORK.md`
3. `handover/TODO.md`
4. 当天 `handover/daily/YYYY-MM-DD.md`

执行规则：
- 先给出你理解的当前目标和本次计划（3-6条）。
- 执行过程中，涉及完成/新增任务时同步更新 `handover/TODO.md`。
- 结束会话前必须产出 session 记录，并写清：已完成、未完成、下一步、风险。
- 最后输出本次变更文件清单。

会话开始命令：
```bash
npm run status:session:start -- --goal "本次目标" --plan "执行计划"
```

会话结束命令：
```bash
npm run status:session:end -- --summary "会话总结" --done "完成A|完成B" --pending "未完成A" --next "下一步A|下一步B" --done-id "1,2" --todo "新增待办A|新增待办B"
```

推送命令：
```bash
npm run status:push -- --message "chore(handover): session update"
```
