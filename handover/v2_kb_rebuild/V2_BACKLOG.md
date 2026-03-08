# V2 Backlog

## P0 (Must)
- [ ] Finish full distillation run (49 books)
- [ ] Quality sampling baseline (label accuracy / evidence traceability / boundary validity)
- [ ] Freeze L0 schema (`principle_id/mechanism/variables/boundary/evidence/citation`)
- [ ] Build first L0 principle-card batch (>=150 cards)
- [ ] Re-index distilled corpus into L1 practice records (source-traceable)
- [ ] Introduce canonical registry and enforce `canonical_id` across L0-L5
- [ ] Introduce normalization profile (unit/temp/time/concentration)
- [ ] Introduce lineage trace (`raw -> chunk -> layer record`)
- [ ] Define RBAC matrix for submit/review/publish/rollback

## P1 (Should)
- [ ] Run first-pass L2 deviation labeling (A/B/C/D) for top topics
- [ ] Build L3 decision strategies for top 10 intents
- [ ] Build internal L4 assets: `Playbook`, `Failure-Atlas`, `Principle Card`, `Experiment Protocol`
- [ ] Define L0-L5 -> Dify service-layer mapping (field + dataset contract)
- [ ] Keep existing Dify 6-entry topology stable during migration
- [ ] Create 30 high-value regression queries
- [ ] Add `current/next` snapshot release path and gray routing
- [ ] Add monitoring dashboard and alert thresholds
- [ ] Add conversation-to-candidate pipeline (no direct L0 write)

## P2 (Could)
- [ ] Add world-flavor taxonomy scaffold (for V3)
- [ ] Add retrieval re-ranking by evidence level + applicability
- [ ] Add confidence-aware response gating rules
- [ ] Add L6 flavor mapping seed set (2 countries, 50 mappings)
- [ ] Add DR drill automation and migration verification scripts

## Definition of Done (V2)
- [ ] Distillation completed with resumable logs and stats
- [ ] L0-L6-ready framework implemented on current corpus (L6 seed optional for V2 release)
- [ ] L0/L1/L2/L3/L4 artifacts are queryable and traceable
- [ ] Dify service layer is fed by mapped L3/L4 outputs without topology break
- [ ] Regression benchmark shows measurable gain vs V1
- [ ] RBAC, alerting, backup/recovery path validated
