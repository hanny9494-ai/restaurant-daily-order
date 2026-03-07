# L0 Change Workflow (3-Stage Minimal)

Last Updated: 2026-03-02

## Goal
Protect L0 quality with minimal process cost.

Stages:
1. Draft (提案)
2. Review (审核)
3. Publish (发布)

## Roles
- Proposer: can create draft changes.
- Reviewer: validates scientific correctness and evidence adequacy.
- Publisher: final release gate and rollback owner.

One person should not perform all three roles on the same change.

## Required Fields For Any L0 Change
- `principle_key`
- `claim`
- `mechanism`
- `boundary_conditions`
- `citation` (>=1)
- `change_reason`

## Stage 1: Draft
Owner: Proposer

Actions:
1. Create new row in `l0_principles` with `status='DRAFT'` and incremented version.
2. Insert citations into `l0_citations`.
3. Create row in `l0_change_requests` with `stage='DRAFT'`.

Entry criteria:
- Required fields complete.
- At least one valid citation attached.

## Stage 2: Review
Owner: Reviewer

Checks:
1. Scientific validity: claim and mechanism are coherent.
2. Boundary validity: explicit operating limits are present.
3. Evidence validity: citation and snippet support the claim.

Decision:
- Pass: set change stage to `READY`, set principle status to `READY`.
- Reject: set stage/status to `REJECTED` with review note.

## Stage 3: Publish
Owner: Publisher

Actions:
1. Confirm publishability (citation exists; status is `READY`).
2. Set principle status to `PUBLISHED`.
3. Set change request stage to `PUBLISHED`.
4. Trigger regression checks on key queries.

Publish rules:
- Append-only versioning: never overwrite old PUBLISHED versions.
- `l0_current` view becomes the only upstream read target.

## Rollback (Fast Path)
1. Mark problematic published version as retired by policy (or supersede with fixed version).
2. Republish previous good version (or publish hotfix version).
3. Re-run regression set and log incident note.

## SLA Suggestion
- Draft -> Review: within 24h
- Review -> Publish: within 24h
- Critical rollback: within 1h

## Minimal Audit Log
For every change keep:
- proposer/reviewer/publisher
- timestamps (`created/reviewed/published`)
- `change_reason`
- `review_note` and `publish_note`
