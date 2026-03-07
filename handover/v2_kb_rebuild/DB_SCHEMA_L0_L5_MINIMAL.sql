-- Minimal schema for L0-L5 knowledge layer (PostgreSQL 15+)
-- Principles:
-- 1) L0 is append-only versioned knowledge.
-- 2) 3-stage approval workflow: DRAFT -> READY -> PUBLISHED.
-- 3) L2-L5 always read from l0_current view.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------- Source registry ----------
create table if not exists source_registry (
  source_id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null, -- book/paper/standard/video/other
  author text,
  publisher text,
  year int,
  lang text,
  source_uri text,
  checksum text,
  reliability_tier text not null default 'A', -- S/A/B
  created_at timestamptz not null default now()
);

-- ---------- L0: append-only canonical principles ----------
create table if not exists l0_principles (
  l0_id uuid primary key default gen_random_uuid(),
  principle_key text not null,            -- stable logical key, e.g. collagen_hydrolysis_temp_time
  version int not null,                   -- monotonically increasing per principle_key
  status text not null,                   -- DRAFT/READY/PUBLISHED/REJECTED
  claim text not null,
  mechanism text not null,
  control_variables jsonb not null default '{}'::jsonb,
  expected_effects jsonb not null default '[]'::jsonb,
  boundary_conditions jsonb not null default '[]'::jsonb,
  counter_examples jsonb not null default '[]'::jsonb,
  evidence_level text not null default 'medium', -- low/medium/high
  confidence numeric(4,3) not null default 0.700,
  embedding vector(1536),
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint uq_l0_key_version unique (principle_key, version),
  constraint ck_l0_status check (status in ('DRAFT','READY','PUBLISHED','REJECTED'))
);

-- Each L0 version can reference multiple citations/snippets.
create table if not exists l0_citations (
  citation_id uuid primary key default gen_random_uuid(),
  l0_id uuid not null references l0_principles(l0_id) on delete cascade,
  source_id uuid not null references source_registry(source_id),
  locator text,             -- chapter/page/section or timestamp
  evidence_snippet text,    -- short supporting excerpt
  created_at timestamptz not null default now()
);

-- ---------- L0 3-stage workflow ----------
create table if not exists l0_change_requests (
  change_id uuid primary key default gen_random_uuid(),
  l0_id uuid not null references l0_principles(l0_id) on delete cascade,
  stage text not null default 'DRAFT', -- DRAFT/READY/PUBLISHED/REJECTED
  change_reason text not null,
  proposer text not null,
  reviewer text,   -- stage 2
  publisher text,  -- stage 3
  review_note text,
  publish_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz,
  constraint ck_change_stage check (stage in ('DRAFT','READY','PUBLISHED','REJECTED'))
);

create index if not exists idx_l0_principles_status on l0_principles(status);
create index if not exists idx_l0_principles_key on l0_principles(principle_key);
create index if not exists idx_l0_change_stage on l0_change_requests(stage);

-- ---------- L0 publish guard ----------
create or replace function ensure_l0_publishable(p_l0_id uuid)
returns boolean
language plpgsql
as $$
declare
  c_count int;
begin
  select count(*) into c_count from l0_citations where l0_id = p_l0_id;
  if c_count < 1 then
    return false;
  end if;
  return true;
end;
$$;

-- ---------- L0 current view (single read target for upper layers) ----------
create or replace view l0_current as
select p.*
from l0_principles p
join (
  select principle_key, max(version) as max_version
  from l0_principles
  where status = 'PUBLISHED'
  group by principle_key
) m on m.principle_key = p.principle_key and m.max_version = p.version;

-- ---------- L1 ----------
create table if not exists l1_practices (
  practice_id uuid primary key default gen_random_uuid(),
  source_id uuid references source_registry(source_id),
  chunk_ref text, -- original chunk id
  goal text,
  steps jsonb not null default '[]'::jsonb,
  parameters jsonb not null default '{}'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  observed_outcomes jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

-- ---------- L2 ----------
create table if not exists l2_analyses (
  analysis_id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references l1_practices(practice_id) on delete cascade,
  linked_l0_ids uuid[] not null default '{}',
  deviation_type text not null, -- A/B/C/D
  causal_explanation text not null,
  tradeoff text,
  score int not null,
  confidence numeric(4,3) not null default 0.700,
  created_at timestamptz not null default now(),
  constraint ck_l2_deviation check (deviation_type in ('A','B','C','D')),
  constraint ck_l2_score check (score >= 0 and score <= 100)
);

-- ---------- L3 ----------
create table if not exists l3_strategies (
  strategy_id uuid primary key default gen_random_uuid(),
  intent text not null,
  decision_tree jsonb not null,
  parameter_ranges jsonb not null default '{}'::jsonb,
  failure_signals jsonb not null default '[]'::jsonb,
  debug_actions jsonb not null default '[]'::jsonb,
  linked_l0_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- L4 ----------
create table if not exists l4_assets (
  asset_id uuid primary key default gen_random_uuid(),
  asset_type text not null, -- PLAYBOOK/FAILURE_ATLAS/PRINCIPLE_CARD/EXPERIMENT_PROTOCOL
  title text not null,
  content jsonb not null,
  linked_strategy_id uuid references l3_strategies(strategy_id),
  linked_l0_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint ck_l4_asset_type check (
    asset_type in ('PLAYBOOK','FAILURE_ATLAS','PRINCIPLE_CARD','EXPERIMENT_PROTOCOL')
  )
);

-- ---------- L5 ----------
create table if not exists l5_policies (
  policy_id uuid primary key default gen_random_uuid(),
  policy_name text not null unique,
  routing_policy jsonb not null default '{}'::jsonb,
  evidence_policy jsonb not null default '{}'::jsonb,
  uncertainty_policy jsonb not null default '{}'::jsonb,
  safety_policy jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Inference trace ----------
create table if not exists reasoning_traces (
  trace_id uuid primary key default gen_random_uuid(),
  query_text text not null,
  used_l0_ids uuid[] not null default '{}',
  used_l3_ids uuid[] not null default '{}',
  used_l4_ids uuid[] not null default '{}',
  l0_snapshot_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);
