# P0 OCR / MinerU Plan (V2.5)

Last Updated: 2026-03-02

## Goal
Prioritize P0 books, run missing OCR first (MinerU), then enter structured extraction.

## P0 Status Snapshot

### Already compiled to markdown (ready for extraction)
1. On Food and Cooking
2. Modernist Cuisine Vol 1 (`Volume 1 - Techniques and Equipment 2.md`)
3. Modernist Cuisine Vol 2 (`volume-2-techniques-and-equipment_Volume+1+-+History+and+Fundamentals.md`)
4. Modernist Cuisine Vol 3
5. Modernist Cuisine Vol 4
6. Molecular Gastronomy
7. The Food Lab
8. The Science of Good Cooking
9. Sauces: Classical and Contemporary
10. The Professional Chef
11. Ratio
12. Flavorama
13. Neurogastronomy
14. Koji Alchemy
15. The Noma Guide to Fermentation
16. The Art of Fermentation
17. 冰淇淋风味学 (OCR markdown exists)

### Not yet compiled in current corpus (must process)
1. The Professional Pastry Chef (PDF in 第二批)
2. Professional Baking (PDF in 第二批)
3. Mouthfeel (PDF in 第二批)
4. French Patisserie (PDF in 第二批)
5. The Science of Spice (PDF in 第二批)

## MinerU First Queue (Execution Order)

### Queue A (highest impact for P0 sweet/dessert science)
1. Professional_Baking_7th_Edition_-_Wayne_Gisslen.pdf
2. _OceanofPDF.com_The_Professional_Pastry_Chef_4e_-_Bo_Friberg.pdf
3. French_Patisserie_-_Ferrandi_Paris.pdf
4. _OceanofPDF.com_Mouthfeel_-_Ole_G_Mouritsen.pdf
5. _OceanofPDF.com_The_Science_of_Spice_-_Stuart_Farrimond.pdf

### Queue B (quality re-run candidates if needed)
1. The Professional Chef 9th ed (already compiled, keep as optional quality rerun)
2. Neurogastronomy (already compiled, rerun only if OCR quality is low)
3. 冰淇淋风味学.pdf (rerun only if current OCR markdown has high noise)

## Extraction Template Routing (after OCR)

### T1 Science Theory (L0-first)
- On Food and Cooking
- Modernist Cuisine Vol 1-4
- Molecular Gastronomy
- The Science of Good Cooking
- Flavorama
- Neurogastronomy
- Mouthfeel
- The Science of Spice

Required outputs:
- claim / mechanism / boundary_conditions / control_variables / evidence_quote / citation

### T2 Professional Technique (L1+L3)
- The Professional Chef
- Sauces: Classical and Contemporary
- Professional Baking
- The Professional Pastry Chef
- French Patisserie
- Ratio

Required outputs:
- parameter_ranges / failure_signals / debug_actions / scenario fit

### T3 Fermentation/Bio Process (L0+L2)
- Koji Alchemy
- Noma Guide to Fermentation
- The Art of Fermentation

Required outputs:
- microbe/enzyme mechanism / risk boundary / process controls / deviation class

### T4 Hybrid Home-to-Science (L1+L2)
- The Food Lab
- 冰淇淋风味学

Required outputs:
- structured practice + L0 linkage + confidence + applicability

## Notes
1. Do not run full extraction for a book before OCR quality spot-check.
2. Use 20-sample chapter check per new OCR output before full run.
3. Keep canonical naming map to avoid duplicate ingestion from different filename variants.
