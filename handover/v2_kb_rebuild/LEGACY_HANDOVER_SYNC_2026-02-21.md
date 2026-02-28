# Legacy Handover Sync (2026-02-21)

Source synced from: `/Users/jeff/Downloads/HANDOVER_MASTER.md`
Sync date: 2026-03-01

## Purpose
This file preserves high-value context from the historical master handover so a new AI session can quickly resume project work.

## Security note
Secrets are intentionally excluded from this Git-tracked file:
- API keys
- private tokens
- full credential strings

Use local secure env/config for secrets (`.zshrc`, local env files, or secret manager).

## Core project definition
- Project vision: culinary R&D copilot, not a generic recipe bot.
- Core capability: translate sensory language into technical culinary decisions, and translate technical decisions back into sensory outcomes.

## Environment baseline
- Hardware: Mac Studio M4 Max, high-memory local workstation.
- Local stack: Dify (Docker), Ollama, OCR pipeline.
- Main local model family: qwen2.5 (7b/14b/32b), plus qwen3.5-plus API path.
- Embedding baseline: qwen3-embedding:8b.

## Stable knowledge architecture
- Service-layer KB pattern stabilized at 6 KBs:
  1. culinary_science
  2. culinary_techniques
  3. culinary_recipes
  4. culinary_ingredients
  5. sensory_language
  6. chefs_notes / troubleshooting extension

Operational rule retained from legacy: do not frequently change service-layer KB topology.

## Data ingestion principles carried forward
- Scanned PDF: prefer MinerU-quality pipeline.
- Digital PDF/text-rich source: use direct text extraction/OCR hybrid.
- Post-conversion quality check is mandatory before KB upload.

## Legacy conversion insights worth preserving
- OCR choice has major downstream impact on retrieval quality.
- Multilingual sensory corpus (EN/JA/ZH) is a strategic differentiator.
- Some titles were previously flagged for possible re-run due to OCR quality concerns.

## Dify / workflow implementation lessons
- Keep workflow IDs and node conventions stable.
- Ensure model provider names and node references match actual deployed plugins.
- Use export-verified DSL patterns to avoid schema mismatch regressions.

## Current V2 alignment
Legacy strategy is now mapped to V2 rebuild track:
- Distill first, then derive functional internal layers.
- Keep Dify service layer stable while rebuilding the internal knowledge engine.
- Add resilience: resumable jobs, auto failover between coding plan and payg API.

## Suggested reading order for new AI sessions
1. `handover/LIVE_CONTEXT.md`
2. `handover/PROJECT_STATUS.md`
3. `handover/v2_kb_rebuild/V2_IMPLEMENTATION_STATUS.md`
4. `handover/v2_kb_rebuild/V2_BACKLOG.md`
5. `handover/v2_kb_rebuild/RUNBOOK_V2_KB_REBUILD.md`
6. This file (`LEGACY_HANDOVER_SYNC_2026-02-21.md`)
