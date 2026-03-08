# V2 Implementation Status

Last Updated: 2026-03-03  
Owner: Jeff + Codex  
Current Phase: `V2.5 L0-first rebuild (question-driven)`

## Goal
Build a quality-first knowledge engine for `L0-L5` (with `L6` reserved for multi-cuisine mapping in V3), while keeping the current execution layer stable.

## Project Summary Table

| Area | Status | Progress | Latest Update | Evidence / File |
|---|---|---:|---|---|
| L0-L6 architecture direction | In Progress | 70% | Confirmed shift to question-driven extraction (not book-driven). | `handover/v2_kb_rebuild/L0_L5_KNOWLEDGE_LAYER_REFACTOR.md` |
| L0 change workflow (2-3 gate approval) | Done | 100% | 3-stage flow drafted: Draft -> Review -> Publish, with conflict/evidence handling. | `handover/v2_kb_rebuild/L0_CHANGE_WORKFLOW_3_STAGE.md` |
| Approval UI prototype | Done | 100% | Review + approve/reject/publish flow prototype completed. | `handover/v2_kb_rebuild/APPROVAL_UI_PROTOTYPE.md` |
| Knowledge admin frontend pages | Done | 95% | `/knowledge` and `/knowledge/l0/queue` available for upload/review. | `app/knowledge/` |
| L0 backend API | Done | 90% | Change list/detail/review/publish endpoints implemented. | `app/api/l0/` |
| Upload + URL assist entry | Done | 85% | Upload and URL assist endpoints available for AI-assisted ingestion. | `app/api/knowledge/` |
| Database schema (minimal + v2.5 complete) | Done | 100% | SQL drafts completed (minimal + complete schema). | `handover/v2_kb_rebuild/DB_SCHEMA_L0_L5_MINIMAL.sql`, `handover/v2_kb_rebuild/DB_SCHEMA_V25_COMPLETE.sql` |
| Local knowledge DB engine | Done | 90% | SQLite-based engine and admin helper implemented. | `lib/l0-engine.ts`, `lib/knowledge-admin.ts` |
| Qwen3.5 prompt + Dify contract design | Done | 100% | Prompt templates and workflow contract documented. | `handover/v2_kb_rebuild/QWEN35_PROMPTS_DIFY_WORKFLOW.md` |
| L0 extraction script (fresh) | In Progress | 80% | New extractor built; direct SQLite ingestion works in smoke run. | `scripts/l0_extract_qwen35.py` |
| L0 verifier layer | In Progress | 75% | Added verifier modes: `rules`, `qwen`, `auto`; waiting for stable long-run stats. | `scripts/l0_extract_qwen35.py` |
| Batch extraction stability | Blocked | 40% | Intermittent timeout on coding-plan endpoint under certain chunk sizes. | `output/l0_extract_verify_smoke*/raw_results.jsonl` |
| Dify deep integration (DSL rewrite) | Pending | 20% | Deferred by design until L0-L5 quality gates are stable. | `handover/v2_kb_rebuild/RUNBOOK_V2_KB_REBUILD.md` |

## What Was Completed In This Round
1. Built end-to-end L0 admin path (upload -> review -> publish) with frontend + API.
2. Implemented fresh Qwen3.5 extractor script (non-reuse approach as requested).
3. Added verifier logic to extraction pipeline with status routing:
   - `pass -> DRAFT`
   - `need_evidence -> NEED_EVIDENCE`
   - `reject -> skip ingest`
4. Validated direct SQLite ingestion path to avoid HTTP 502 bottleneck in local API submission.
5. Produced/updated runbooks and SQL specs for restartable L0 ingestion.

## Current Risks / Blockers
1. Endpoint timeout variance: same model may timeout depending on chunk size and response complexity.
2. Quality risk: extraction can drift if not constrained by a fixed L0 question master.
3. Process risk: batch runs were started/interrupted multiple times; need one frozen run protocol.

## Decision Freeze (Before Next Batch)
1. Extraction will follow `Question Master -> Book Mapping -> Extraction -> Triple Verification -> Ingest`.
2. No full Dify integration work until L0 acceptance criteria are stable.
3. No uncontrolled bulk run without quality dashboard output.

## Next Actions (Ordered)
1. Publish `L0 Question Master v1` (first 100 question rows, 12 domains).
2. Freeze `L0 5-gate acceptance standard` and reject/need_evidence rules.
3. Run a controlled pilot on 10-20 questions (not chapter-wide), output quality report.
4. After pilot pass, execute batch by question set and update this status table daily.
