CREATE TABLE IF NOT EXISTS stations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS units (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS recipe_users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'EDITOR', 'REVIEWER', 'VIEWER')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  entity_kind TEXT NOT NULL DEFAULT 'ELEMENT' CHECK (entity_kind IN ('COMPOSITE', 'ELEMENT')),
  business_type TEXT NOT NULL DEFAULT 'BACKBONE' CHECK (business_type IN ('MENU', 'BACKBONE')),
  technique_family TEXT,
  recipe_type TEXT NOT NULL DEFAULT 'BACKBONE' CHECK (recipe_type IN ('MENU', 'BACKBONE')),
  menu_cycle TEXT,
  import_source TEXT,
  active_version_id BIGINT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_versions (
  id BIGSERIAL PRIMARY KEY,
  recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED')),
  servings TEXT,
  instructions TEXT NOT NULL DEFAULT '',
  record_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_note TEXT,
  created_by TEXT NOT NULL,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_note TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(recipe_id, version_no)
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id BIGSERIAL PRIMARY KEY,
  recipe_version_id BIGINT NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT NOT NULL,
  unit TEXT NOT NULL,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipe_version_components (
  id BIGSERIAL PRIMARY KEY,
  parent_version_id BIGINT NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  component_kind TEXT NOT NULL CHECK (
    component_kind IN ('RECIPE_REF', 'REFERENCE_PREP', 'RAW_ITEM', 'FINISH_ITEM')
  ),
  child_recipe_id BIGINT REFERENCES recipes(id),
  child_version_id BIGINT REFERENCES recipe_versions(id),
  display_name TEXT NOT NULL,
  component_role TEXT,
  section TEXT NOT NULL CHECK (
    section IN ('PREP', 'INTERMEDIATE', 'ASSEMBLY', 'FINISH', 'PLATING')
  ),
  quantity TEXT,
  unit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_optional BOOLEAN NOT NULL DEFAULT FALSE,
  source_ref TEXT,
  prep_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe ON recipe_versions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_versions_status ON recipe_versions(status);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_version ON recipe_ingredients(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_recipe_version_components_parent ON recipe_version_components(parent_version_id, section, sort_order);
CREATE INDEX IF NOT EXISTS idx_recipe_version_components_child_recipe ON recipe_version_components(child_recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_version_components_child_version ON recipe_version_components(child_version_id);

CREATE TABLE IF NOT EXISTS recipe_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  recipe_version_id BIGINT NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED')),
  endpoint TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_sync_logs_recipe ON recipe_sync_logs(recipe_id, recipe_version_id, created_at DESC);

INSERT INTO stations(name, is_active) VALUES
  ('炉台', TRUE),
  ('冷菜', TRUE),
  ('甜品', TRUE)
ON CONFLICT(name) DO UPDATE SET is_active = EXCLUDED.is_active;

INSERT INTO suppliers(name, is_active) VALUES
  ('默认供应商', TRUE)
ON CONFLICT(name) DO UPDATE SET is_active = EXCLUDED.is_active;

INSERT INTO units(name, is_active) VALUES
  ('克', TRUE),
  ('千克', TRUE),
  ('条', TRUE),
  ('个', TRUE),
  ('箱', TRUE),
  ('g', TRUE),
  ('kg', TRUE),
  ('ml', TRUE),
  ('l', TRUE),
  ('pcs', TRUE),
  ('ea', TRUE),
  ('只', TRUE),
  ('斤', TRUE),
  ('片', TRUE),
  ('根', TRUE),
  ('份', TRUE),
  ('batch', TRUE),
  ('TT', TRUE)
ON CONFLICT(name) DO UPDATE SET is_active = EXCLUDED.is_active;

INSERT INTO recipe_users(name, email, role, is_active) VALUES
  ('系统管理员', 'owner@restaurant.local', 'OWNER', TRUE),
  ('行政总厨', 'chef@restaurant.local', 'EDITOR', TRUE),
  ('店长审批', 'manager@restaurant.local', 'REVIEWER', TRUE),
  ('同事查看', 'viewer@restaurant.local', 'VIEWER', TRUE)
ON CONFLICT(email) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active;
