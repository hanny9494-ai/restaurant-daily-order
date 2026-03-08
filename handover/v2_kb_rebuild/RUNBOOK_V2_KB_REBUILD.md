# Runbook: V2 KB Rebuild

## Scope
Incremental ingestion and distillation pipeline for new books, with automatic archival into `L0-L6` knowledge layers and mapped delivery to Dify service layer.

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
6. Build L0-L4 knowledge assets
7. Define L5 runtime reasoning policies
8. Build L6 flavor mapping seeds
9. Map and publish to Dify service layer

## Standard Operating Procedure (SOP)
1. Intake and naming
- Put new books into managed source folders (scanned vs digital).
- Enforce filename schema: `author_title_year`.
- Record metadata: `title/author/lang/source/import_date/license`.

2. OCR and text normalization
- Scanned PDFs: MinerU-first.
- Digital PDFs: direct text extraction first, OCR fallback if needed.
- Export normalized UTF-8 markdown/text.
- Run post-conversion quality check (noise, blank pages, encoding issues).

3. Chunking
- Use V2 chunk parameters (large chunks to control token overhead).
- Generate `all_chunks.json` with stable `chunk_id`.
- Spot-check at least 20 chunks before annotation.

4. Distillation annotation
- Run `phase2_annotate_v2_2.py` (resume enabled).
- Required fields: `primary_kb`, `secondary_kbs`, `evidence_level`, `evidence_quotes`, `applicable_conditions`, `confidence`, `quality`, `summary`.
- Enable channel failover (coding-plan limit -> payg -> cooldown switch-back).

5. Validation and review split
- Produce stats: success / validation_error / errors.
- Route low-confidence or validation-failed chunks into review queue.
- Sample-review: label correctness, evidence traceability, applicability sanity.

6. Mother-table archival
- Archive all accepted chunks into the canonical table.
- Keep raw text + annotation + run metadata + snapshot version.
- Never overwrite historical snapshots.

7. Build knowledge layers (L0-L4)
- L0: scientific principles with mechanism and boundaries.
- L1: structured practice observations from distilled chunks.
- L2: deviation/causality analysis (A/B/C/D).
- L3: strategy synthesis (decision trees, parameter ranges).
- L4: reusable assets (`Playbook`, `Failure-Atlas`, `Principle Card`, `Experiment Protocol`).

8. Define L5 runtime policies
- Routing by user intent and confidence.
- Evidence-first answer policy.
- Uncertainty and conflict fallback policy.

9. Dify mapping and release
- Keep existing Dify service-layer topology stable.
- Map L3/L4 outputs into Dify-facing KB datasets.
- Run regression queries before gray release.
- Keep previous mapping snapshot for rollback.

10. Snapshot release policy (`current/next`)
- Build and validate on `next`.
- Gray route 5-20% traffic to `next`.
- Promote `next` to `current` only after regression gate passes.

## Should raw book markdown be used directly as reasoning source?
Short answer: **No, not as the primary reasoning source**.

Policy:
1. Primary reasoning source should be distilled and validated layer artifacts (L0-L4).
2. Raw markdown remains as:
- cold backup corpus
- audit/reference source
- temporary bootstrap material for empty domains
3. Raw text should not dominate reasoning ranking over validated layer outputs.

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
- `canonical_id`
- `lineage.raw_id`
- `lineage.chunk_id`

## Operational Rules
1. Never overwrite raw source
2. Keep resumable checkpoints
3. Keep channel state for cost audit
4. Route low confidence to review queue
5. Version every layer snapshot
6. Enforce RBAC for submit/review/publish actions
7. Keep unit normalization profile version in every transformed record
8. Conversation logs enter candidate pool only (no direct L0 publish)

## Monitoring
1. Process health (single runner only)
2. Progress (`_progress.json`, jsonl lines)
3. Channel switch events (coding/payg)
4. Error buckets (`json_error`, `validation_error`, `api_error`)
5. Alert thresholds:
- layer build failure rate > 5%
- no-citation answer ratio > 2%
- regression pass rate < 95%
- current/next snapshot mismatch

## Rollback
1. Keep previous layer snapshot and mapping index
2. Roll back Dify mapping first; do not delete raw distilled table
3. Re-run only affected batch range when possible

## DR / Migration
1. Backup: daily full snapshot + hourly incremental metadata.
2. Recovery drill: restore latest snapshot in staging every week.
3. Migration path: dev -> staging -> prod with checksum and row-count validation.
