# L0 Batch-1 Tasks (On Food and Cooking)

Source file:
`/Users/jeff/Documents/厨书数据库（编译）/_OceanofPDF.com_On_Food_and_Cooking_The_Science_and_Lore_of_the_Kitchen_-_Harold_McGee.md`

## Batch Scope (First 3 chapters)
- Chapter 1: Milk and Dairy Products
  - line range: 163 - 1606
- Chapter 2: Eggs
  - line range: 1607 - 2540
- Chapter 3: Meat
  - line range: 2541 - 3707

(Chapter 4 starts at line 3708)

## Extraction Steps
1. Split each chapter into chunks of ~800-1500 tokens.
2. Run L0 extraction prompt on each chunk.
3. Keep only candidates with mechanism + measurable params + evidence locator.
4. Auto-route low confidence (<0.75) or missing citation to `NEED_EVIDENCE`.
5. Submit remaining records as `DRAFT` for queue review.

## Output Targets
- Candidate volume: 80-120 L0 candidates total (3 chapters)
- Publish-ready target after review: >= 50
- Mandatory traceability: 100% (book/chapter/page(or locator)/quote)

## Review Priority
1. Protein denaturation/coagulation
2. Collagen/gelatin hydrolysis
3. Emulsion and fat behavior
4. Heat-time texture transitions
