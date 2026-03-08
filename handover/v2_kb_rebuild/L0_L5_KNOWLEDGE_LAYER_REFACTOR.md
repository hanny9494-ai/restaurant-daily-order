# L0-L6 Knowledge Layer Refactor (Engine-First)

Last Updated: 2026-03-03  
Owner: Jeff + Codex

## Scope
This document defines the V2 knowledge-layer refactor under the new engine framework.

Constraint:
- Keep the existing scientific execution pipeline unchanged for now (OCR/chunking/annotation runner/checkpoint/failover).
- Refactor only the knowledge semantics and layer contracts.

## North Star
Make `L0` the scientific-principle core, then let the agent read and understand more culinary books through L0-grounded interpretation instead of raw text memorization.

Core loop:
`L0 principles -> L1 practice observations -> L2 deviation analysis -> L3 strategy synthesis -> L4 reusable assets -> L5 runtime policies -> L6 flavor mapping`

## Cross-Layer Architecture Constraints (Mandatory)
1. Every entity must have a stable `canonical_id` and keep aliases in a registry.
2. Every entity must keep lineage pointer to raw source: `raw_id -> chunk_id -> layer_record_id`.
3. Quantitative fields must pass normalization profile (unit/temp/time/concentration).
4. All online reads use `current` snapshot; gray release uses `next` snapshot.
5. Conversation logs can feed candidate pool, but never bypass layer quality gates.

## Shared Registries
### Canonical Registry
- `canonical_id`
- `canonical_name`
- `aliases[]`
- `term_lang`
- `entity_type` (ingredient/technique/process/flavor/safety)

### Normalization Profile
- `unit_system` (metric first)
- `temperature_standard` (`C`)
- `time_standard` (`second/minute/hour`)
- `concentration_standard` (`w/w`, `w/v`, `v/v`)
- `conversion_source`

### Lineage Trace
- `raw_id`
- `chunk_id`
- `layer_record_id`
- `transform_step`
- `transform_version`
- `operator_or_agent`

## Layer Definitions

### L0: Scientific Principle Library (Foundation)
Goal:
- Build stable, topic-agnostic scientific primitives for culinary reasoning.

Input:
- High-confidence food science sources (books, textbooks, validated papers).

Output units:
- `principle_id`
- `principle_name`
- `mechanism` (physics/chemistry/biology/sensory)
- `control_variables` (temp/time/pH/water activity/etc.)
- `expected_effects`
- `boundary_conditions`
- `counter_examples`
- `evidence_level`
- `citation`

Quality gate:
- Must include mechanism + boundary conditions + citation.
- No principle without falsifiable statement.

---

### L1: Practice Observation Library
Goal:
- Convert recipes/chef methods/books into structured observable practice records.

Input:
- Distilled chunks from existing pipeline.

Output units:
- `practice_id`
- `source_id` (book/chapter/chunk)
- `goal` (clarity/body/flavor/efficiency/etc.)
- `steps`
- `parameters` (quantified)
- `constraints` (equipment/budget/skill/time)
- `observed_outcomes`

Quality gate:
- Parameters must be normalized where possible.
- Every practice record must preserve source traceability.

---

### L2: Deviation and Causality Library
Goal:
- Compare L1 practices against L0 principles and explain why differences happen.

Input:
- L0 + L1.

Output units:
- `analysis_id`
- `practice_id`
- `linked_principles[]`
- `deviation_type` (`A` science-optimized / `B` preference / `C` constraint / `D` myth-risk)
- `causal_explanation`
- `tradeoff`
- `score` (0-100)
- `confidence`
- `recommended_context`

Quality gate:
- No scoring without explanation.
- `D` items must include correction recommendation.

---

### L3: Strategy Synthesis Library
Goal:
- Turn analysis into executable decision knowledge.

Input:
- L2 clusters and high-confidence cases.

Output units:
- `strategy_id`
- `intent` (clear soup / rich body / speed-first / yield-first)
- `decision_tree`
- `parameter_ranges`
- `failure_signals`
- `debug_actions`
- `explain_with_principles` (linked L0 ids)

Quality gate:
- Strategy must be testable with explicit success criteria.
- Must include at least one failure path and recovery path.

---

### L4: Reusable Knowledge Assets
Goal:
- Package L3 into reusable internal assets for different agent tasks.

Input:
- Curated L3 strategies.

Output asset types:
- `Playbook` (step-by-step execution)
- `Failure Atlas` (symptom -> cause -> fix)
- `Principle Card` (compact L0 references)
- `Experiment Protocol` (A/B and hypothesis testing templates)

Quality gate:
- Assets must be self-contained and source-linked.

---

### L5: Runtime Reasoning Policies
Goal:
- Define how the agent uses L0-L4 at inference time.

Input:
- L0-L4 assets.

Output units:
- `routing_policy` (which layer first by user intent)
- `evidence_policy` (when to require citations)
- `uncertainty_policy` (ask/abstain/offer experiment)
- `safety_policy` (myth-risk handling)

Quality gate:
- If confidence is low or principle conflict exists, agent must surface uncertainty and fallback options.

---

### L6: Flavor and Cultural Mapping Layer (V3 Seed)
Goal:
- Keep culinary logic consistent while projecting outputs into different cuisine cultures.

Input:
- L0-L5 outputs + cultural flavor ontology.

Output units:
- `flavor_map_id`
- `source_flavor_node`
- `target_flavor_node`
- `equivalent_ingredients[]`
- `technique_adjustments`
- `cultural_constraints`
- `transferability_score` (0-100)
- `evidence`

Quality gate:
- L6 cannot override L0 scientific boundaries.
- Any substitution must include impact notes on flavor and process.

## Mapping From Current V2 Assets
- Current distilled mother table -> primary source for L1.
- Existing annotation fields (`evidence`, `confidence`, `summary`) -> seed signals for L2.
- Existing 4 internal views:
  - `Core-Science` -> mostly L0/L4 Principle Cards
  - `Execution-Playbook` -> L3/L4 Playbooks
  - `Failure-Atlas` -> L2/L4 failure corpus
  - `Inspiration-Lab` -> L3/L4 experiment protocols

## Minimal Build Order (No Execution Pipeline Change)
1. Freeze L0 schema and create first 150 principle cards.
2. Re-index current distilled chunks into L1 practice records.
3. Run first-pass L2 deviation labeling on high-frequency topics.
4. Generate L3 decision trees for top 10 intents.
5. Package L4 assets and define L5 runtime policy set.
6. Add L6 seed ontology and first cross-cuisine mapping set.

## Definition of Done (Knowledge Layer Refactor)
- L0 schema finalized and populated with auditable citations.
- L1 records for current corpus generated with source traceability.
- L2 deviation labels and causal explanations available for top topics.
- L3 strategies cover at least 10 common culinary intents.
- L4 assets can be called by agent prompts consistently.
- L5 policies enforce evidence-first reasoning behavior.
- L6 seed mapping supports at least 2 cuisine routes without violating L0 boundaries.

## Governance and Operations
### RBAC
- `proposer`: create draft and candidate imports.
- `reviewer`: scientific/data quality review.
- `publisher`: publish/rollback snapshot and mapping.
- `viewer`: read-only.

### Monitoring and Alerts
- Pipeline metrics: ingest success rate, layer build latency, error bucket ratio.
- Quality metrics: L0 citation completeness, L2 confidence drift, regression pass rate.
- Runtime metrics: query latency, fallback rate, answer-without-citation rate.
- Alert triggers: threshold breach for 15 minutes or snapshot mismatch.

### DR and Migration
- Snapshot backup cadence: daily full + hourly incremental metadata.
- Recovery drills: weekly restore check on staging.
- Migration: `dev -> staging -> prod` with checksum and record-count verification.
