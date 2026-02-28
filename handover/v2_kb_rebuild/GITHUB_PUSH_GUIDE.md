# GitHub Push Guide (V2)

## Daily Update Routine
1. Update files:
- `V2_IMPLEMENTATION_STATUS.md`
- `V2_BACKLOG.md`
- `V2_WEEKLY_PLAN.md`

2. Commit and push:
```bash
cd '/Users/jeff/Documents/New project'
git add handover/v2_kb_rebuild
git commit -m "v2: status update $(date +%F_%H%M)"
git push
```

## Milestone Update Routine
Use when a major step completes (full run done, new layer built, Dify mapping ready):
```bash
cd '/Users/jeff/Documents/New project'
git add handover/v2_kb_rebuild
git commit -m "v2: milestone - <short title>"
git push
```

## Branch Suggestion
- Main progress tracking: `main`
- Experimental changes: `codex/v2-kb-rebuild-*`
