# Recipe Import Regression Report

Base URL: http://localhost:3000
Actor: owner@restaurant.local
Generated: 2026-03-07T04:49:52.939Z

## components_lobster
- label: Components text with long instructions
- ok: true
- status: 200
- count: 4
- parse_method: local_deterministic
- recipes: [{"name":"Lobster Brine","steps":3,"ingredients":2},{"name":"Lobster Sauce","steps":3,"ingredients":2},{"name":"Pumpkin Puree","steps":1,"ingredients":1},{"name":"Pear Gel","steps":1,"ingredients":2}]
- confirm_steps: [{"dish_code":"AUTO-COMP-1-REG-1772858993089","steps":3},{"dish_code":"AUTO-COMP-2-REG-1772858993089","steps":3}]

## nonstandard_bullets
- label: Non-standard bullet components
- ok: true
- status: 200
- count: 3
- parse_method: local_deterministic
- recipes: [{"name":"Sauce Base","steps":2,"ingredients":2},{"name":"Crunch","steps":1,"ingredients":1},{"name":"Herb Oil","steps":1,"ingredients":2}]
- confirm_steps: [{"dish_code":"AUTO-COMP-1-REG-1772858993221","steps":2},{"dish_code":"AUTO-COMP-2-REG-1772858993221","steps":1}]

## basic_sauce_bilingual
- label: Bilingual backbone text
- ok: true
- status: 200
- count: 2
- parse_method: ai
- recipes: [{"name":"Beef Jus","steps":3,"ingredients":3},{"name":"Chicken Stock","steps":2,"ingredients":3}]
- confirm_steps: [{"dish_code":"BS-01-REG-1772859001801","steps":3},{"dish_code":"BS-02-REG-1772859001801","steps":2}]

## csv_components
- label: CSV import
- ok: true
- status: 200
- count: 2
- parse_method: ai
- recipes: [{"name":"Lemon Curd","steps":1,"ingredients":2},{"name":"Crust","steps":1,"ingredients":2}]
- confirm_steps: [{"dish_code":"LC-001-REG-1772859008934","steps":1},{"dish_code":"CR-001-REG-1772859008934","steps":1}]

## markdown_table
- label: Markdown table recipe
- ok: true
- status: 200
- count: 1
- parse_method: ai
- recipes: [{"name":"Brown Butter Sauce","steps":3,"ingredients":2}]
- confirm_steps: [{"dish_code":"AUTO-PENDING-1-REG-1772859013627","steps":3}]

## mixed_component_titles
- label: Mixed bilingual components
- ok: true
- status: 200
- count: 3
- parse_method: local_deterministic
- recipes: [{"name":"Duck Jus","steps":3,"ingredients":1},{"name":"绿油 Green Oil","steps":3,"ingredients":1},{"name":"Crispy Skin","steps":2,"ingredients":1}]
- confirm_steps: [{"dish_code":"AUTO-COMP-1-REG-1772859013649","steps":3},{"dish_code":"AUTO-COMP-2-REG-1772859013649","steps":3}]

## docx_basic_sauce
- label: DOCX import
- ok: true
- status: 200
- count: 7
- parse_method: docx_text_ai
- recipes: [{"name":"Beef Stock","steps":4,"ingredients":11},{"name":"Beef 2nd Jus","steps":4,"ingredients":7},{"name":"Beef Jus","steps":3,"ingredients":3},{"name":"Chicken Stock","steps":4,"ingredients":6},{"name":"Duck Jus","steps":4,"ingredients":7},{"name":"Chicken Jus","steps":3,"ingredients":4},{"name":"Chinese Chicken Stock","steps":5,"ingredients":5}]
- confirm_steps: [{"dish_code":"BS-01-REG-1772859088423","steps":4},{"dish_code":"BS-02-REG-1772859088423","steps":4}]

