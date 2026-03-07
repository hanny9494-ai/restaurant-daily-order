-- V2.5 Complete Schema (PostgreSQL 15+)
-- Scope: L0-L6 knowledge engine + 3-stage approval + memory + candidate pool + audit

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ========================
-- 0) Access and Users
-- ========================
create table if not exists app_users (
  user_id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text,
  role text not null check (role in ('proposer','reviewer','publisher','viewer','admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ========================
-- 1) Source + Raw Ingest
-- ========================
create table if not exists source_registry (
  source_id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null, -- book/paper/standard/video/web/other
  author text,
  publisher text,
  year int,
  lang text,
  edition text,
  source_uri text,
  checksum text,
  reliability_tier text not null default 'A' check (reliability_tier in ('S','A','B','C')),
  created_at timestamptz not null default now()
);

create table if not exists raw_ingest (
  raw_id uuid primary key default gen_random_uuid(),
  source_id uuid not null references source_registry(source_id),
  content_type text not null default 'text',
  raw_text text,
  meta jsonb not null default '{}'::jsonb,
  ingest_status text not null default 'IMPORTED' check (ingest_status in ('IMPORTED','NORMALIZED','CHUNKED','FAILED')),
  created_at timestamptz not null default now()
);

create table if not exists raw_chunks (
  chunk_id uuid primary key default gen_random_uuid(),
  raw_id uuid not null references raw_ingest(raw_id) on delete cascade,
  chapter_id text,
  section_id text,
  page_range int4range,
  chunk_order int not null,
  text text not null,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique(raw_id, chunk_order)
);

-- ========================
-- 2) Canonical / Normalization / Lineage
-- ========================
create table if not exists canonical_registry (
  canonical_id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  entity_type text not null check (entity_type in ('ingredient','technique','process','flavor','safety','other')),
  term_lang text,
  aliases jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(canonical_name, entity_type)
);

create table if not exists normalization_profiles (
  profile_id uuid primary key default gen_random_uuid(),
  profile_name text not null unique,
  unit_system text not null default 'metric',
  temperature_standard text not null default 'C',
  time_standard text not null default 'minute',
  concentration_standard text not null default 'w_w',
  conversion_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table if not exists lineage_traces (
  lineage_id uuid primary key default gen_random_uuid(),
  raw_id uuid references raw_ingest(raw_id),
  chunk_id uuid references raw_chunks(chunk_id),
  layer text not null check (layer in ('L0','L1','L2','L3','L4','L5','L6')),
  layer_record_id uuid not null,
  transform_step text not null,
  transform_version text,
  operator_id uuid references app_users(user_id),
  created_at timestamptz not null default now()
);

-- ========================
-- 3) L0 + Approval (3-stage)
-- ========================
create table if not exists l0_principles (
  l0_id uuid primary key default gen_random_uuid(),
  principle_key text not null,
  version int not null,
  status text not null check (status in ('DRAFT','READY','PUBLISHED','REJECTED','NEED_EVIDENCE')),
  canonical_id uuid references canonical_registry(canonical_id),
  normalization_profile_id uuid references normalization_profiles(profile_id),
  claim text not null,
  mechanism text not null,
  control_variables jsonb not null default '{}'::jsonb,
  expected_effects jsonb not null default '[]'::jsonb,
  boundary_conditions jsonb not null default '[]'::jsonb,
  counter_examples jsonb not null default '[]'::jsonb,
  evidence_level text not null default 'medium' check (evidence_level in ('low','medium','high')),
  confidence numeric(4,3) not null default 0.700,
  embedding vector(1536),
  created_by uuid references app_users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(principle_key, version)
);

create table if not exists l0_citations (
  citation_id uuid primary key default gen_random_uuid(),
  l0_id uuid not null references l0_principles(l0_id) on delete cascade,
  source_id uuid not null references source_registry(source_id),
  locator text,
  evidence_snippet text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists l0_change_requests (
  change_id uuid primary key default gen_random_uuid(),
  l0_id uuid not null references l0_principles(l0_id) on delete cascade,
  stage text not null default 'DRAFT' check (stage in ('DRAFT','READY','PUBLISHED','REJECTED','NEED_EVIDENCE')),
  change_reason text not null,
  proposer_id uuid not null references app_users(user_id),
  reviewer_id uuid references app_users(user_id),
  publisher_id uuid references app_users(user_id),
  review_note text,
  publish_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz
);

create or replace function ensure_l0_publishable(p_l0_id uuid)
returns boolean language plpgsql as $$
declare c_count int;
begin
  select count(*) into c_count from l0_citations where l0_id = p_l0_id;
  if c_count < 1 then return false; end if;
  return true;
end;
$$;

create or replace view l0_current as
select p.*
from l0_principles p
join (
  select principle_key, max(version) as max_version
  from l0_principles
  where status = 'PUBLISHED'
  group by principle_key
) m on m.principle_key = p.principle_key and m.max_version = p.version;

-- ========================
-- 4) L1-L5
-- ========================
create table if not exists l1_practices (
  practice_id uuid primary key default gen_random_uuid(),
  source_id uuid references source_registry(source_id),
  chunk_ref uuid references raw_chunks(chunk_id),
  canonical_id uuid references canonical_registry(canonical_id),
  goal text,
  steps jsonb not null default '[]'::jsonb,
  parameters jsonb not null default '{}'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  observed_outcomes jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 0.700,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create table if not exists l2_analyses (
  analysis_id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references l1_practices(practice_id) on delete cascade,
  linked_l0_ids uuid[] not null default '{}',
  deviation_type text not null check (deviation_type in ('A','B','C','D')),
  causal_explanation text not null,
  tradeoff text,
  score int not null check (score between 0 and 100),
  confidence numeric(4,3) not null default 0.700,
  recommended_context text,
  created_at timestamptz not null default now()
);

create table if not exists l3_strategies (
  strategy_id uuid primary key default gen_random_uuid(),
  intent text not null,
  decision_tree jsonb not null,
  parameter_ranges jsonb not null default '{}'::jsonb,
  failure_signals jsonb not null default '[]'::jsonb,
  debug_actions jsonb not null default '[]'::jsonb,
  linked_l0_ids uuid[] not null default '{}',
  confidence numeric(4,3) not null default 0.700,
  created_at timestamptz not null default now()
);

create table if not exists l4_assets (
  asset_id uuid primary key default gen_random_uuid(),
  asset_type text not null check (asset_type in ('PLAYBOOK','FAILURE_ATLAS','PRINCIPLE_CARD','EXPERIMENT_PROTOCOL')),
  title text not null,
  content jsonb not null,
  linked_strategy_id uuid references l3_strategies(strategy_id),
  linked_l0_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

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

-- ========================
-- 5) L6 Flavor Mapping (V3 seed)
-- ========================
create table if not exists l6_flavor_mappings (
  flavor_map_id uuid primary key default gen_random_uuid(),
  source_flavor_node text not null,
  target_flavor_node text not null,
  source_culture text not null,
  target_culture text not null,
  equivalent_ingredients jsonb not null default '[]'::jsonb,
  aroma_taste_vector jsonb not null default '{}'::jsonb,
  technique_adjustments jsonb not null default '{}'::jsonb,
  cultural_constraints jsonb not null default '[]'::jsonb,
  transferability_score int not null default 70 check (transferability_score between 0 and 100),
  linked_l0_ids uuid[] not null default '{}',
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(4,3) not null default 0.700,
  created_at timestamptz not null default now()
);

-- ========================
-- 6) Conversation memory + restart
-- ========================
create table if not exists conversation_sessions (
  session_id uuid primary key default gen_random_uuid(),
  user_external_id text not null,
  workflow_id text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'RUNNING' check (status in ('INIT','RUNNING','WAITING_USER','BLOCKED','DONE'))
);

create table if not exists conversation_events (
  event_id uuid primary key default gen_random_uuid(),
  session_id uuid not null references conversation_sessions(session_id) on delete cascade,
  turn_no int not null,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  used_l0_ids uuid[] not null default '{}',
  used_l3_ids uuid[] not null default '{}',
  used_l4_ids uuid[] not null default '{}',
  confidence numeric(4,3),
  created_at timestamptz not null default now(),
  unique(session_id, turn_no, role)
);

create table if not exists user_memory_profiles (
  memory_id uuid primary key default gen_random_uuid(),
  user_external_id text not null,
  memory_level text not null check (memory_level in ('M1','M2')),
  memory_key text not null,
  memory_value jsonb not null,
  confidence numeric(4,3) not null default 0.700,
  updated_at timestamptz not null default now(),
  unique(user_external_id, memory_level, memory_key)
);

create table if not exists restart_packets (
  packet_id uuid primary key default gen_random_uuid(),
  session_id uuid not null references conversation_sessions(session_id) on delete cascade,
  user_external_id text not null,
  summary text not null,
  completed_steps jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  next_actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  is_latest boolean not null default true
);

-- ========================
-- 7) Candidate pool (conversation -> knowledge)
-- ========================
create table if not exists candidate_pool (
  candidate_id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('conversation','upload','web','manual')),
  source_ref text,
  target_layer text not null check (target_layer in ('L1','L2','L3','L4','L6')),
  payload jsonb not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','REJECTED','IMPORTED')),
  confidence numeric(4,3) not null default 0.700,
  created_by uuid references app_users(user_id),
  created_at timestamptz not null default now()
);

-- ========================
-- 8) Dify mapping + snapshots + audit
-- ========================
create table if not exists dify_dataset_mappings (
  mapping_id uuid primary key default gen_random_uuid(),
  service_entry text not null,
  source_layer text not null check (source_layer in ('L0','L1','L2','L3','L4','L5','L6')),
  field_mapping jsonb not null,
  status text not null default 'CURRENT' check (status in ('CURRENT','NEXT','ARCHIVED')),
  created_at timestamptz not null default now()
);

create table if not exists release_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  snapshot_name text not null unique,
  stage text not null check (stage in ('DEV','STAGING','PROD')),
  status text not null check (status in ('CURRENT','NEXT','ROLLED_BACK')),
  notes text,
  created_by uuid references app_users(user_id),
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  audit_id uuid primary key default gen_random_uuid(),
  actor_id uuid references app_users(user_id),
  action text not null,
  resource_type text not null,
  resource_id text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

-- ========================
-- 9) Indexes
-- ========================
create index if not exists idx_raw_chunks_embedding on raw_chunks using ivfflat (embedding vector_cosine_ops);
create index if not exists idx_l0_status on l0_principles(status);
create index if not exists idx_l0_key on l0_principles(principle_key);
create index if not exists idx_l1_embedding on l1_practices using ivfflat (embedding vector_cosine_ops);
create index if not exists idx_l2_deviation on l2_analyses(deviation_type);
create index if not exists idx_l6_culture on l6_flavor_mappings(source_culture, target_culture);
create index if not exists idx_conv_session on conversation_events(session_id, turn_no);
create index if not exists idx_candidate_layer on candidate_pool(target_layer, status);
create index if not exists idx_audit_time on audit_logs(created_at);

-- ========================
-- 10) Helpful Views
-- ========================
create or replace view candidate_ready as
select * from candidate_pool where status = 'READY';

create or replace view active_restart_packets as
select * from restart_packets where is_latest = true order by created_at desc;

-- End
