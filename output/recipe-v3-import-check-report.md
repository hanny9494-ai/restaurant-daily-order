# Recipe V3 Import Check Report

Base URL: http://localhost:3000
Actor: owner@restaurant.local
Generated: 2026-03-08T15:17:55.866Z

## components_lobster_text
- label: Components text / lobster
- ok: true
- import_status: 200
- confirm_status: 200
- import_count: 5
- mode: COMPOSITE
- parse_method: local_deterministic
- imported: [{"name":"Lobster Brine","ingredients":2,"steps":4},{"name":"Lobster Sauce","ingredients":2,"steps":4},{"name":"Pumpkin Puree","ingredients":1,"steps":2},{"name":"Pear Gel","ingredients":2,"steps":2},{"name":"Yellow Daisy","ingredients":1,"steps":1}]
- persisted: [{"name":"Lobster","entity_kind":"COMPOSITE","ingredients":1,"steps":0,"links":5},{"name":"Lobster Brine","entity_kind":"ELEMENT","ingredients":2,"steps":4,"links":0},{"name":"Lobster Sauce","entity_kind":"ELEMENT","ingredients":2,"steps":4,"links":0},{"name":"Pumpkin Puree","entity_kind":"ELEMENT","ingredients":1,"steps":2,"links":0},{"name":"Pear Gel","entity_kind":"ELEMENT","ingredients":2,"steps":2,"links":0},{"name":"Yellow Daisy","entity_kind":"ELEMENT","ingredients":1,"steps":1,"links":0}]

## nonstandard_bullets
- label: Non-standard bullet components
- ok: true
- import_status: 200
- confirm_status: 200
- import_count: 3
- mode: COMPOSITE
- parse_method: local_deterministic
- imported: [{"name":"Sauce Base","ingredients":2,"steps":3},{"name":"Crunch","ingredients":1,"steps":1},{"name":"Herb Oil","ingredients":2,"steps":3}]
- persisted: [{"name":"Chef Special","entity_kind":"COMPOSITE","ingredients":1,"steps":0,"links":3},{"name":"Sauce Base","entity_kind":"ELEMENT","ingredients":2,"steps":3,"links":0},{"name":"Crunch","entity_kind":"ELEMENT","ingredients":1,"steps":1,"links":0},{"name":"Herb Oil","entity_kind":"ELEMENT","ingredients":2,"steps":3,"links":0}]

## basic_sauce_text
- label: Basic sauce bilingual text
- ok: true
- import_status: 200
- confirm_status: 200
- import_count: 3
- mode: ELEMENT_LIBRARY
- parse_method: ai
- imported: [{"name":"Beef Jus","ingredients":3,"steps":3},{"name":"Chicken Stock","ingredients":3,"steps":2},{"name":"Chinese Chicken Stock","ingredients":2,"steps":3}]
- persisted: [{"name":"Beef Jus","entity_kind":"ELEMENT","ingredients":3,"steps":3,"links":0},{"name":"Chicken Stock","entity_kind":"ELEMENT","ingredients":3,"steps":2,"links":0},{"name":"Chinese Chicken Stock","entity_kind":"ELEMENT","ingredients":2,"steps":3,"links":0}]

## csv_components
- label: CSV import
- ok: true
- import_status: 200
- confirm_status: 200
- import_count: 2
- mode: ELEMENT_LIBRARY
- parse_method: ai
- imported: [{"name":"Lemon Curd","ingredients":2,"steps":1},{"name":"Crust","ingredients":2,"steps":1}]
- persisted: [{"name":"Lemon Curd","entity_kind":"ELEMENT","ingredients":2,"steps":1,"links":0},{"name":"Crust","entity_kind":"ELEMENT","ingredients":2,"steps":1,"links":0}]

## markdown_table
- label: Markdown table recipe
- ok: true
- import_status: 200
- confirm_status: 200
- import_count: 1
- mode: SINGLE_ELEMENT
- parse_method: ai
- imported: [{"name":"Brown Butter Sauce","ingredients":2,"steps":3}]
- persisted: [{"name":"Brown Butter Sauce","entity_kind":"ELEMENT","ingredients":2,"steps":3,"links":0}]

## mixed_component_titles
- label: Mixed bilingual components
- ok: true
- import_status: 200
- confirm_status: 200
- import_count: 3
- mode: COMPOSITE
- parse_method: local_deterministic
- imported: [{"name":"Duck Jus","ingredients":1,"steps":3},{"name":"绿油 Green Oil","ingredients":2,"steps":3},{"name":"Crispy Skin","ingredients":1,"steps":2}]
- persisted: [{"name":"Duck","entity_kind":"COMPOSITE","ingredients":1,"steps":0,"links":3},{"name":"Duck Jus","entity_kind":"ELEMENT","ingredients":1,"steps":3,"links":0},{"name":"绿油 Green Oil","entity_kind":"ELEMENT","ingredients":2,"steps":3,"links":0},{"name":"Crispy Skin","entity_kind":"ELEMENT","ingredients":1,"steps":2,"links":0}]

## cookbook_composite
- label: Cookbook composite / caviar
- ok: true
- import_status: 200
- confirm_status: 200
- import_count: 4
- mode: COMPOSITE
- parse_method: ai
- imported: [{"name":"BONITO BAVAROIS","ingredients":1,"steps":1},{"name":"CORN BAVAROIS","ingredients":1,"steps":1},{"name":"TO FINISH","ingredients":1,"steps":1},{"name":"Onion blossoms","ingredients":1,"steps":1}]
- persisted: [{"name":"CAVIAR WITH CORN AND BONITO","entity_kind":"COMPOSITE","ingredients":1,"steps":3,"links":6},{"name":"BONITO BAVAROIS","entity_kind":"ELEMENT","ingredients":1,"steps":1,"links":0},{"name":"CORN BAVAROIS","entity_kind":"ELEMENT","ingredients":1,"steps":1,"links":0},{"name":"TO FINISH","entity_kind":"ELEMENT","ingredients":1,"steps":1,"links":0},{"name":"Onion blossoms","entity_kind":"ELEMENT","ingredients":1,"steps":1,"links":0}]

## docx_lobster
- label: DOCX lobster
- ok: true
- import_status: 200
- confirm_status: 200
- import_count: 7
- mode: COMPOSITE
- parse_method: docx_text_deterministic
- imported: [{"name":"Lobster Brine","ingredients":13,"steps":3},{"name":"Lobster Sauce","ingredients":15,"steps":6},{"name":"Pumpkin Puree","ingredients":4,"steps":4},{"name":"Pear chips","ingredients":1,"steps":1},{"name":"Pear Gel","ingredients":3,"steps":2},{"name":"Cordyceps flower","ingredients":1,"steps":1},{"name":"Yellow daisy","ingredients":1,"steps":1}]
- persisted: [{"name":"Lobster","entity_kind":"COMPOSITE","ingredients":1,"steps":0,"links":7},{"name":"Lobster Brine","entity_kind":"ELEMENT","ingredients":13,"steps":3,"links":0},{"name":"Lobster Sauce","entity_kind":"ELEMENT","ingredients":15,"steps":6,"links":0},{"name":"Pumpkin Puree","entity_kind":"ELEMENT","ingredients":4,"steps":4,"links":0},{"name":"Pear chips","entity_kind":"ELEMENT","ingredients":1,"steps":1,"links":0},{"name":"Pear Gel","entity_kind":"ELEMENT","ingredients":3,"steps":2,"links":0},{"name":"Cordyceps flower","entity_kind":"ELEMENT","ingredients":1,"steps":1,"links":0},{"name":"Yellow daisy","entity_kind":"ELEMENT","ingredients":1,"steps":1,"links":0}]

## docx_basic_sauce
- label: DOCX basic sauce
- ok: true
- import_status: 200
- confirm_status: 200
- import_count: 7
- mode: ELEMENT_LIBRARY
- parse_method: docx_text_ai
- imported: [{"name":"Beef Stock","ingredients":11,"steps":3},{"name":"Beef 2nd Jus","ingredients":7,"steps":3},{"name":"Beef Jus","ingredients":3,"steps":3},{"name":"Chicken Stock","ingredients":6,"steps":3},{"name":"Duck Jus","ingredients":7,"steps":3},{"name":"Chicken Jus","ingredients":4,"steps":3},{"name":"Chinese Chicken Stock","ingredients":5,"steps":3}]
- persisted: [{"name":"Beef Stock","entity_kind":"ELEMENT","ingredients":11,"steps":3,"links":0},{"name":"Beef 2nd Jus","entity_kind":"ELEMENT","ingredients":7,"steps":3,"links":0},{"name":"Beef Jus","entity_kind":"ELEMENT","ingredients":3,"steps":3,"links":0},{"name":"Chicken Stock","entity_kind":"ELEMENT","ingredients":6,"steps":3,"links":0},{"name":"Duck Jus","entity_kind":"ELEMENT","ingredients":7,"steps":3,"links":0},{"name":"Chicken Jus","entity_kind":"ELEMENT","ingredients":4,"steps":3,"links":0},{"name":"Chinese Chicken Stock","entity_kind":"ELEMENT","ingredients":5,"steps":3,"links":0}]

## docx_crab
- label: DOCX crab
- ok: true
- import_status: 200
- confirm_status: 200
- import_count: 7
- mode: COMPOSITE
- parse_method: docx_text_deterministic
- imported: [{"name":"Crab","ingredients":3,"steps":3},{"name":"Pomelo skin","ingredients":1,"steps":3},{"name":"Gazpacho","ingredients":10,"steps":14},{"name":"Chinese yellow wine jelly","ingredients":10,"steps":6},{"name":"Ginger sabayon","ingredients":8,"steps":5},{"name":"Ginger oil","ingredients":1,"steps":3},{"name":"Ginger tea","ingredients":6,"steps":3}]
- persisted: [{"name":"Crab-Ginger-Pomelo","entity_kind":"COMPOSITE","ingredients":1,"steps":0,"links":7},{"name":"Crab","entity_kind":"ELEMENT","ingredients":3,"steps":3,"links":0},{"name":"Pomelo skin","entity_kind":"ELEMENT","ingredients":1,"steps":3,"links":0},{"name":"Gazpacho","entity_kind":"ELEMENT","ingredients":10,"steps":14,"links":0},{"name":"Chinese yellow wine jelly","entity_kind":"ELEMENT","ingredients":10,"steps":6,"links":0},{"name":"Ginger sabayon","entity_kind":"ELEMENT","ingredients":8,"steps":5,"links":0},{"name":"Ginger oil","entity_kind":"ELEMENT","ingredients":1,"steps":3,"links":0},{"name":"Ginger tea","entity_kind":"ELEMENT","ingredients":6,"steps":3,"links":0}]

