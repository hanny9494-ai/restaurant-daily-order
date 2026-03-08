-- V3-lite migration draft
-- Target: evolve current recipe model into COMPOSITE + ELEMENT + component links
-- Strategy: additive migration first, keep recipe_type/menu_cycle compatibility during transition

BEGIN TRANSACTION;

-- 1. Extend recipes with V3-lite core fields
ALTER TABLE recipes ADD COLUMN entity_kind TEXT;
ALTER TABLE recipes ADD COLUMN business_type TEXT;
ALTER TABLE recipes ADD COLUMN technique_family TEXT;

-- Backfill from current V2 semantics.
-- Existing records are all treated as ELEMENT in V3-lite.
UPDATE recipes
SET entity_kind = 'ELEMENT'
WHERE entity_kind IS NULL OR TRIM(entity_kind) = '';

UPDATE recipes
SET business_type = CASE
  WHEN recipe_type IN ('MENU', 'BACKBONE') THEN recipe_type
  ELSE 'BACKBONE'
END
WHERE business_type IS NULL OR TRIM(business_type) = '';

-- 2. Create component link table
CREATE TABLE IF NOT EXISTS recipe_version_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_version_id INTEGER NOT NULL,
  component_kind TEXT NOT NULL CHECK (
    component_kind IN ('RECIPE_REF', 'REFERENCE_PREP', 'RAW_ITEM', 'FINISH_ITEM')
  ),
  child_recipe_id INTEGER,
  child_version_id INTEGER,
  display_name TEXT NOT NULL,
  component_role TEXT,
  section TEXT NOT NULL CHECK (
    section IN ('PREP', 'INTERMEDIATE', 'ASSEMBLY', 'FINISH', 'PLATING')
  ),
  quantity TEXT,
  unit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_optional INTEGER NOT NULL DEFAULT 0,
  source_ref TEXT,
  prep_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (parent_version_id) REFERENCES recipe_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (child_recipe_id) REFERENCES recipes(id),
  FOREIGN KEY (child_version_id) REFERENCES recipe_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_version_components_parent
  ON recipe_version_components(parent_version_id, section, sort_order);

CREATE INDEX IF NOT EXISTS idx_recipe_version_components_child_recipe
  ON recipe_version_components(child_recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipe_version_components_child_version
  ON recipe_version_components(child_version_id);

CREATE INDEX IF NOT EXISTS idx_recipes_entity_business
  ON recipes(entity_kind, business_type, technique_family);

-- 3. Optional anchor fields in record_json will be handled at application/schema level:
--    - steps[].step_id
--    - production.key_temperature_points[].point_id
--
-- No destructive column rewrite is performed in this migration.
-- Existing recipe_type/menu_cycle remain available for compatibility during rollout.

COMMIT;
