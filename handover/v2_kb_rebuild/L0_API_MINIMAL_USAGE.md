# L0 API Minimal Usage (Prototype)

Base URL: `http://localhost:3000`

## 1) Submit Draft
`POST /api/l0/changes`

```bash
curl -X POST http://localhost:3000/api/l0/changes \
  -H "Content-Type: application/json" \
  -d '{
    "principle_key":"collagen_hydrolysis_temp_time",
    "claim":"Collagen hydrolyzes into gelatin under sustained heat and time.",
    "mechanism":"Heat disrupts collagen triple helix and forms soluble gelatin chains.",
    "boundary_conditions":[{"temperature_c":[75,95]},{"time_h":[4,12]}],
    "control_variables":{"temperature_c":[75,95],"time_h":[4,12]},
    "expected_effects":["higher viscosity","gel set when chilled"],
    "counter_examples":["too short extraction yields weak body"],
    "evidence_level":"high",
    "confidence":0.9,
    "change_reason":"Add canonical L0 principle for stock body reasoning",
    "proposer":"jeff",
    "citations":[
      {
        "source_title":"On Food and Cooking",
        "source_type":"book",
        "reliability_tier":"S",
        "locator":"chapter: meats and stocks",
        "evidence_snippet":"Long cooking converts collagen to gelatin."
      }
    ]
  }'
```

## 2) Review Draft
`POST /api/l0/changes/:id/review`

```bash
curl -X POST http://localhost:3000/api/l0/changes/1/review \
  -H "Content-Type: application/json" \
  -d '{
    "reviewer":"alice",
    "approved":true,
    "review_note":"Mechanism and boundaries are valid."
  }'
```

## 3) Publish Draft
`POST /api/l0/changes/:id/publish`

```bash
curl -X POST http://localhost:3000/api/l0/changes/1/publish \
  -H "Content-Type: application/json" \
  -d '{
    "publisher":"bob",
    "publish_note":"Passed quick regression checks."
  }'
```

## 4) List Changes
`GET /api/l0/changes?limit=50`

```bash
curl "http://localhost:3000/api/l0/changes?limit=20"
```

## Notes
- This prototype stores workflow data in `data/l0_engine.db` (SQLite).
- Production target can keep the same API contract and swap storage to PostgreSQL.
