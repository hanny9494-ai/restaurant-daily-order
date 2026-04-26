# 10 Generated Recipe Regression Report

Date: 2026-03-10
Base URL: https://restaurant-daily-order.vercel.app
Environment: Production Vercel + Postgres
Actor: owner@restaurant.local
Reviewer: owner@restaurant.local

## Summary

10/10 cases passed the full recipe chain:
- create/import
- confirm
- submit
- review
- publish
- cleanup

After the run, the production recipe list returned `0` records, which confirms cleanup completed successfully.

## Results

### 1. direct_sauce
- type: direct `ELEMENT`
- create: `201`
- submit: `200`
- review: `200`
- publish: `200`
- stored steps: `3`

### 2. direct_stock
- type: direct `ELEMENT`
- create: `201`
- submit: `200`
- review: `200`
- publish: `200`
- stored steps: `3`

### 3. basic_library
- type: import `ELEMENT_LIBRARY`
- import: `200`
- detected count: `3`
- confirm: `200`
- created count: `3`
- submit: `200`
- review: `200`
- publish: `200`

### 4. components_composite
- type: import `COMPOSITE`
- import: `200`
- detected count: `3`
- confirm: `200`
- created count: `4`
- submit: `200`
- review: `200`
- publish: `200`
- assembly steps on composite: `1`

### 5. cookbook_finish
- type: import `COMPOSITE`
- import: `200`
- detected count: `3`
- finish items: `caviar`, `Onion blossoms`
- confirm: `200`
- created count: `4`
- submit: `200`
- review: `200`
- publish: `200`

### 6. for_the_x
- type: import `COMPOSITE`
- import: `200`
- detected count: `3`
- confirm: `200`
- created count: `4`
- submit: `200`
- review: `200`
- publish: `200`

### 7. markdown_single
- type: import `SINGLE_ELEMENT`
- import: `200`
- detected count: `1`
- confirm: `200`
- created count: `1`
- submit: `200`
- review: `200`
- publish: `200`
- stored steps: `3`

### 8. csv_components
- type: import `ELEMENT_LIBRARY`
- import: `200`
- detected count: `2`
- confirm: `200`
- created count: `2`
- submit: `200`
- review: `200`
- publish: `200`

### 9. nonstandard_bullets
- type: import `COMPOSITE`
- import: `200`
- detected count: `3`
- confirm: `200`
- created count: `4`
- submit: `200`
- review: `200`
- publish: `200`

### 10. broken_line_style
- type: import `COMPOSITE`
- import: `200`
- detected count: `1`
- finish items: `Basil blooms`, `Cracked black pepper`
- confirm: `200`
- created count: `2`
- submit: `200`
- review: `200`
- publish: `200`

## Observations

1. The production chain is now operational and stable.
2. `TO FINISH` items are no longer promoted into bogus `ELEMENT` drafts in the tested cookbook-style scenario.
3. Low-quality freeform text still tends to collapse into fewer detected sub-recipes than a structured source, but the import/persist/approval chain remains healthy.
4. Composite records rely on fallback `assembly_steps` when the source does not contain a strong structured finishing method block.

## Conclusion

The system is ready for first-batch real recipe entry.
The main remaining work is parser quality refinement, not workflow stability.
