-- Run after DB_SCHEMA_L0_L5_MINIMAL.sql
-- Purpose: seed minimal L0 samples for validation

-- ---------- Sources ----------
insert into source_registry (title, source_type, author, publisher, year, lang, source_uri, reliability_tier)
values
  ('On Food and Cooking', 'book', 'Harold McGee', 'Scribner', 2004, 'en', null, 'S'),
  ('Modernist Cuisine', 'book', 'Nathan Myhrvold', 'The Cooking Lab', 2011, 'en', null, 'S')
on conflict do nothing;

-- ---------- L0 sample #1 ----------
with src as (
  select source_id from source_registry where title = 'On Food and Cooking' limit 1
),
ins as (
  insert into l0_principles (
    principle_key, version, status, claim, mechanism, control_variables,
    expected_effects, boundary_conditions, counter_examples,
    evidence_level, confidence, created_by
  )
  values (
    'collagen_hydrolysis_temp_time',
    1,
    'PUBLISHED',
    'Collagen hydrolyzes into gelatin under sustained heat and time, increasing broth body.',
    'Heat disrupts collagen triple helix and converts it into soluble gelatin chains.',
    '{"temperature_c":[75,95],"time_h":[4,12]}',
    '["higher viscosity","gel set when chilled"]',
    '["too high boil can increase turbidity", "too short extraction yields weak body"]',
    '["pressure cooking changes kinetics"]',
    'high',
    0.93,
    'system_seed'
  )
  returning l0_id
)
insert into l0_citations (l0_id, source_id, locator, evidence_snippet)
select ins.l0_id, src.source_id, 'chapter: meats and stocks', 'Collagen converts to gelatin during long cooking, improving texture.'
from ins, src;

-- ---------- L0 sample #2 ----------
with src as (
  select source_id from source_registry where title = 'Modernist Cuisine' limit 1
),
ins as (
  insert into l0_principles (
    principle_key, version, status, claim, mechanism, control_variables,
    expected_effects, boundary_conditions, counter_examples,
    evidence_level, confidence, created_by
  )
  values (
    'emulsion_boil_fat_dispersion',
    1,
    'PUBLISHED',
    'Vigorous boiling and agitation can emulsify fat droplets and produce opaque white broth.',
    'Mechanical shear and protein fragments stabilize micron-scale fat droplets in water.',
    '{"temperature_c":[100,105],"agitation":"high"}',
    '["opaque appearance","heavier mouthfeel"]',
    '["not suitable for clear stock targets"]',
    '["low-fat bones may fail to sustain emulsion"]',
    'medium',
    0.87,
    'system_seed'
  )
  returning l0_id
)
insert into l0_citations (l0_id, source_id, locator, evidence_snippet)
select ins.l0_id, src.source_id, 'volume: stocks and sauces', 'Strong boil and shear can drive stable fat dispersion in certain broths.'
from ins, src;

-- ---------- Optional check ----------
-- select principle_key, version, status from l0_current order by principle_key;
