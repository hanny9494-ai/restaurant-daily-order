# Runbook: V2 KB Rebuild

## Scope
Incremental ingestion and distillation pipeline for new books, with automatic archival into multi-layer KB views.

## Inputs
1. OCR text (cleaned)
2. Book metadata (title, author, source)
3. Distillation config (model, chunk params, failover keys)

## Workflow
1. OCR normalization
2. Chunking
3. Distillation annotation
4. Validation + review queue split
5. Archive to mother table
6. Derive internal functional layers
7. Map/export to Dify service KBs

## Required Fields Per Chunk
- `chunk_id`
- `text`
- `source`
- `primary_kb`
- `secondary_kbs`
- `evidence_level`
- `evidence_quotes`
- `applicable_conditions`
- `confidence`
- `quality`
- `summary`

## Operational Rules
1. Never overwrite raw source
2. Keep resumable checkpoints
3. Keep channel state for cost audit
4. Route low confidence to review queue
5. Version every export snapshot

## Monitoring
1. Process health (single runner only)
2. Progress (`_progress.json`, jsonl lines)
3. Channel switch events (coding/payg)
4. Error buckets (`json_error`, `validation_error`, `api_error`)

## Rollback
1. Keep previous export snapshot and dataset mapping
2. Roll back Dify mapping first; do not delete raw distilled table
3. Re-run only affected batch range when possible
