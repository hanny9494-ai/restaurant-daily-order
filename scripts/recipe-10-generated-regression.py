import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get('RECIPES_E2E_BASE_URL', 'https://restaurant-daily-order.vercel.app').rstrip('/')
ACTOR = os.environ.get('RECIPES_E2E_ACTOR', 'owner@restaurant.local')
REVIEWER = os.environ.get('RECIPES_E2E_REVIEWER', 'owner@restaurant.local')
REPORT = Path('/Users/jeff/Documents/New project/output/recipe-10-generated-regression-report.md')


def req(method, path, payload=None, timeout=120):
    data = None if payload is None else json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(f'{BASE_URL}{path}', data=data, method=method)
    if data is not None:
        request.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode('utf-8')
            try:
                body = json.loads(raw) if raw else {}
            except Exception:
                body = {'raw': raw}
            return response.status, body
    except urllib.error.HTTPError as error:
        raw = error.read().decode('utf-8', errors='ignore')
        try:
            body = json.loads(raw) if raw else {}
        except Exception:
            body = {'raw': raw}
        return error.code, body


def get_active_version(detail):
    versions = (detail.get('data') or {}).get('versions') or []
    if not versions:
        return None
    active_id = (detail.get('data') or {}).get('active_version_id')
    for version in versions:
        if version.get('id') == active_id:
            return version
    return versions[0]


def parse_record(version):
    raw = version.get('recipe_record_json') if version else None
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return raw or {}


def delete_recipe(recipe_id):
    return req('DELETE', f'/api/recipes/{recipe_id}', {'actor_email': ACTOR}, timeout=60)


def cleanup_created(created_rows):
    deleted = []
    for row in sorted(created_rows, key=lambda x: int(x.get('recipe_id') or 0), reverse=True):
        recipe_id = int(row.get('recipe_id') or 0)
        if recipe_id <= 0:
            continue
        status, _ = delete_recipe(recipe_id)
        deleted.append((recipe_id, status))
    return deleted


def build_confirm_payload(import_data, case_id):
    suffix = f'_GEN10_{case_id.upper()}_{int(time.time())}'
    recipes = json.loads(json.dumps(import_data.get('recipes', [])))
    preview = json.loads(json.dumps(import_data.get('v3_preview') or {})) if import_data.get('v3_preview') else None
    code_map = {}

    for recipe in recipes:
        original = str(recipe.get('meta', {}).get('dish_code') or 'AUTO')
        next_code = f'{original}{suffix}'[:120]
        recipe['meta']['dish_code'] = next_code
        code_map[original] = next_code

    if preview and preview.get('elements'):
        for element in preview['elements']:
            original = str(element.get('dish_code') or 'AUTO')
            element['dish_code'] = code_map.get(original, f'{original}{suffix}'[:120])
    if preview and preview.get('composite'):
        original = str(preview['composite'].get('dish_code') or 'AUTO_COMPOSITE')
        preview['composite']['dish_code'] = f'{original}{suffix}'[:120]
        for component in preview['composite'].get('assembly_components') or []:
            child_code = component.get('child_code')
            if child_code:
                component['child_code'] = code_map.get(str(child_code), f'{child_code}{suffix}'[:120])

    return {
        'actor_email': ACTOR,
        'recipes': recipes,
        'v3_preview': preview,
    }


def run_import_case(case):
    result = {'id': case['id'], 'label': case['label'], 'errors': []}
    status, import_data = req('POST', '/api/recipes/import', {'actor_email': ACTOR, **case['payload']}, timeout=180)
    result['import_status'] = status
    result['import_mode'] = ((import_data.get('v3_preview') or {}).get('mode')) if isinstance(import_data, dict) else None
    result['import_count'] = int(import_data.get('count') or 0) if isinstance(import_data, dict) else 0
    result['recipe_names'] = [r.get('meta', {}).get('dish_name') for r in import_data.get('recipes', [])] if isinstance(import_data, dict) else []
    result['finish_items'] = [f.get('ref_name') for f in ((import_data.get('v3_preview') or {}).get('finish_items') or [])] if isinstance(import_data, dict) else []
    if status != 200:
        result['errors'].append(f'import failed {status}')
        return result
    if case.get('expect_mode') and result['import_mode'] != case['expect_mode']:
        result['errors'].append(f"mode mismatch expected={case['expect_mode']} actual={result['import_mode']}")
    if case.get('expect_min', 0) and result['import_count'] < case['expect_min']:
        result['errors'].append(f"import count too low {result['import_count']}")

    confirm_payload = build_confirm_payload(import_data, case['id'])
    confirm_status, confirm_data = req('POST', '/api/recipes/import/confirm', confirm_payload, timeout=180)
    result['confirm_status'] = confirm_status
    created = confirm_data.get('created', []) if isinstance(confirm_data, dict) else []
    result['created_count'] = len(created)
    result['created'] = created
    if confirm_status != 200:
        result['errors'].append(f'confirm failed {confirm_status}')
        return result

    details = []
    for row in created:
        d_status, d_data = req('GET', f"/api/recipes/{row['recipe_id']}", timeout=60)
        if d_status != 200:
            details.append({'recipe_id': row['recipe_id'], 'status': d_status})
            result['errors'].append(f"detail failed recipe_id={row['recipe_id']} status={d_status}")
            continue
        version = get_active_version(d_data)
        record = parse_record(version)
        entry = {
            'recipe_id': row['recipe_id'],
            'name': (d_data.get('data') or {}).get('name'),
            'entity_kind': (d_data.get('data') or {}).get('entity_kind'),
            'business_type': (d_data.get('data') or {}).get('business_type'),
            'steps': len(record.get('steps', []) or []),
            'assembly_steps': len(record.get('assembly_steps', []) or []),
        }
        details.append(entry)
    result['details'] = details

    target = None
    target_mode = case.get('chain_target', 'first-element')
    if target_mode == 'composite':
        for row in created:
            for detail in details:
                if detail.get('recipe_id') == row.get('recipe_id') and detail.get('entity_kind') == 'COMPOSITE':
                    target = row
                    break
            if target:
                break
    else:
        for row in created:
            for detail in details:
                if detail.get('recipe_id') == row.get('recipe_id') and detail.get('entity_kind') == 'ELEMENT':
                    target = row
                    break
            if target:
                break

    if target:
        version_id = int(target.get('version_id') or 0)
        s1, _ = req('POST', f'/api/recipes/versions/{version_id}/submit', {'actor_email': ACTOR}, timeout=60)
        s2, _ = req('POST', f'/api/recipes/versions/{version_id}/review', {'reviewer': REVIEWER, 'decision': 'approve'}, timeout=60)
        s3, _ = req('POST', f'/api/recipes/versions/{version_id}/publish', {'publisher': REVIEWER}, timeout=60)
        result['submit_status'] = s1
        result['review_status'] = s2
        result['publish_status'] = s3
        if s1 != 200: result['errors'].append(f'submit failed {s1}')
        if s2 != 200: result['errors'].append(f'review failed {s2}')
        if s3 != 200: result['errors'].append(f'publish failed {s3}')
    else:
        result['errors'].append('no chain target')

    result['cleanup'] = cleanup_created(created)
    return result


def run_direct_case(case):
    result = {'id': case['id'], 'label': case['label'], 'errors': []}
    code = f"TEST_DIRECT_{case['id'].upper()}_{int(time.time())}"
    payload = {
        'code': code,
        'name': case['name'],
        'description': 'generated direct smoke',
        'business_type': case.get('business_type', 'BACKBONE'),
        'menu_cycle': case.get('menu_cycle'),
        'yield': case.get('yield', '1份'),
        'instructions': case.get('instructions', '1. test step'),
        'created_by': ACTOR,
        'ingredients': case.get('ingredients', [{'name': 'water', 'quantity': '1', 'unit': '份', 'note': ''}])
    }
    s1, d1 = req('POST', '/api/recipes', payload, timeout=60)
    result['create_status'] = s1
    if s1 not in (200, 201):
        result['errors'].append(f'create failed {s1}')
        return result
    data = d1.get('data') or {}
    recipe_id = data.get('id')
    version = (data.get('versions') or [None])[0]
    version_id = (version or {}).get('id')
    result['recipe_id'] = recipe_id
    result['version_id'] = version_id
    s2, detail = req('GET', f'/api/recipes/{recipe_id}', timeout=60)
    result['detail_status'] = s2
    if s2 == 200:
        active = get_active_version(detail)
        record = parse_record(active)
        result['steps'] = len(record.get('steps', []) or [])
    s3, _ = req('POST', f'/api/recipes/versions/{version_id}/submit', {'actor_email': ACTOR}, timeout=60)
    s4, _ = req('POST', f'/api/recipes/versions/{version_id}/review', {'reviewer': REVIEWER, 'decision': 'approve'}, timeout=60)
    s5, _ = req('POST', f'/api/recipes/versions/{version_id}/publish', {'publisher': REVIEWER}, timeout=60)
    result['submit_status'] = s3
    result['review_status'] = s4
    result['publish_status'] = s5
    if s3 != 200: result['errors'].append(f'submit failed {s3}')
    if s4 != 200: result['errors'].append(f'review failed {s4}')
    if s5 != 200: result['errors'].append(f'publish failed {s5}')
    result['cleanup'] = [delete_recipe(recipe_id)]
    return result


CASES = [
    {
        'id': 'single_direct_sauce',
        'kind': 'direct',
        'label': '单个 Element 直接录入 / Sauce',
        'name': 'Generated Brown Butter Sauce',
        'instructions': '1. Melt butter.\n2. Brown milk solids.\n3. Strain and hold warm.',
        'ingredients': [
            {'name': 'Butter', 'quantity': '300', 'unit': 'g', 'note': ''},
            {'name': 'Salt', 'quantity': '2', 'unit': 'g', 'note': ''}
        ]
    },
    {
        'id': 'single_direct_stock',
        'kind': 'direct',
        'label': '单个 Element 直接录入 / Stock',
        'name': 'Generated Chicken Stock',
        'instructions': '1. Roast bones lightly.\n2. Add water and vegetables.\n3. Simmer 4 hours and strain.',
        'ingredients': [
            {'name': 'Chicken Bones', 'quantity': '5', 'unit': 'kg', 'note': ''},
            {'name': 'Water', 'quantity': '8', 'unit': 'l', 'note': ''}
        ]
    },
    {
        'id': 'basic_library_text',
        'kind': 'import',
        'label': '基础库文本 / 3 backbone',
        'expect_mode': 'ELEMENT_LIBRARY',
        'expect_min': 3,
        'chain_target': 'first-element',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'BASIC RECIPES','',
                'BASIC SUGAR SYRUP','Sugar 500g','Water 500ml','Instruction:','Boil and cool.','',
                'CLARIFIED BUTTER','Butter 2kg','Instruction:','Melt gently and skim.','',
                'CULTURED CREAM','Cream 1l','Culture 1 tsp','Instruction:','Heat, inoculate, ferment, chill.'
            ])
        }
    },
    {
        'id': 'components_composite',
        'kind': 'import',
        'label': 'Components 复合菜',
        'expect_mode': 'COMPOSITE',
        'expect_min': 3,
        'chain_target': 'composite',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'Lobster', '', 'Components:', '- Lobster Brine', '- Lobster Sauce', '- Pumpkin Puree', '',
                'Lobster Brine','Water','1000g','Salt','17g','Instruction:','Boil water and simmer 30 mins.','',
                'Lobster Sauce','Chicken stock','500g','Cream','200g','Instruction:','Reduce and strain.','',
                'Pumpkin Puree','Pumpkin','500g','Instruction:','Roast and blend.'
            ])
        }
    },
    {
        'id': 'cookbook_finish_composite',
        'kind': 'import',
        'label': 'Cookbook TO FINISH 复合菜',
        'expect_mode': 'COMPOSITE',
        'expect_min': 2,
        'chain_target': 'composite',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'CAVIAR WITH CORN AND BONITO','Serves 8','',
                'BONITO BAVAROIS','45 g bonito flakes','450 g cream','Instruction:','Infuse, strain, fold whipped cream, chill.','',
                'CORN BAVAROIS','350 g corn juice','120 g cream','Instruction:','Reduce, add gelatin, fold cream, chill.','',
                'TO FINISH','56 g caviar','Onion blossoms','Quenelle both bavarois, add caviar, garnish with onion blossoms.'
            ])
        }
    },
    {
        'id': 'for_the_x_cookbook',
        'kind': 'import',
        'label': 'FOR THE X cookbook 结构',
        'expect_mode': 'COMPOSITE',
        'expect_min': 2,
        'chain_target': 'composite',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'Pan-Roasted Squab with Swiss Chard','',
                'SWISS CHARD','Swiss chard 1 bunch','Butter 20g','',
                'SQUAB','Squab 2 birds','Beurre Monte 100g','',
                'OVEN-DRIED FIGS','Black Mission figs 6ea','',
                'FOR THE SWISS CHARD: Wilt leaves in butter and season with salt.','',
                'FOR THE OVEN-DRIED FIGS: Dust with sugar and bake until supple.','',
                'FOR THE SQUAB: Roast until medium rare and baste with beurre monte.','',
                'TO COMPLETE: Plate squab with chard and figs.'
            ])
        }
    },
    {
        'id': 'markdown_single',
        'kind': 'import',
        'label': 'Markdown 表格单元素',
        'expect_mode': 'SINGLE_ELEMENT',
        'expect_min': 1,
        'chain_target': 'first-element',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'Lemon Butter Sauce','',
                '| Ingredient | Qty |','| --- | --- |','| Butter | 200g |','| Lemon juice | 30g |','',
                'Instruction:','Melt butter. Whisk in lemon juice. Hold warm.'
            ])
        }
    },
    {
        'id': 'csv_components',
        'kind': 'import',
        'label': 'CSV 组件导入',
        'expect_min': 2,
        'chain_target': 'first-element',
        'payload': {
            'type': 'csv',
            'content': '\n'.join([
                'Section,Name,Qty',
                'Components,Lemon Curd,',
                'Components,Crust,',
                'Lemon Curd,Lemon juice,200g',
                'Lemon Curd,Sugar,120g',
                'Lemon Curd,Instruction,heat and whisk then cool',
                'Crust,Flour,300g',
                'Crust,Butter,180g',
                'Crust,Instruction,bake 25 mins'
            ])
        }
    },
    {
        'id': 'nonstandard_bullets',
        'kind': 'import',
        'label': '非标准 bullet 组件',
        'expect_mode': 'COMPOSITE',
        'expect_min': 3,
        'chain_target': 'composite',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'Duck', '', 'Components:', '• Duck Jus', '• Herb Oil', '• Crunch', '',
                'Duck Jus','Duck stock','1000g','Instruction:','Reduce and strain.','',
                'Herb Oil','Parsley','200g','Oil','300g','Instruction:','Blend and strain.','',
                'Crunch','Bread crumbs','150g','Instruction:','Toast until golden.'
            ])
        }
    },
    {
        'id': 'broken_line_docx_style',
        'kind': 'import',
        'label': 'DOCX 风格断行文本',
        'expect_mode': 'COMPOSITE',
        'expect_min': 2,
        'chain_target': 'composite',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'Tomato Salad with Basil and Shallot','Serves 8','',
                'TOMATO SAUCE','Tomato Water','500 g','Basil','10 g','Instruction:','Heat half the tomato water. Steep basil. Blend with xanthan and strain.','',
                'TOMATO BAVAROIS','Tomato Water','300 g','Cream','300 g','Instruction:','Reduce, add gelatin, fold cream, chill until set.','',
                'TO FINISH','Basil blooms','Cracked black pepper','Pipe bavarois and finish with sauce.'
            ])
        }
    }
]


def main():
    lines = [
        '# 10 Generated Recipe Regression Report',
        '',
        f'Base URL: {BASE_URL}',
        f'Generated: {time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}',
        ''
    ]
    any_fail = False
    for case in CASES:
        print(f"CASE_START {case['id']}")
        result = run_direct_case(case) if case['kind'] == 'direct' else run_import_case(case)
        ok = len(result['errors']) == 0
        if not ok:
            any_fail = True
        print(f"CASE_DONE {case['id']} ok={ok}")
        lines.append(f"## {case['id']}")
        lines.append(f"- label: {case['label']}")
        lines.append(f"- ok: {ok}")
        for key in ('import_status','import_mode','import_count','confirm_status','created_count','create_status','submit_status','review_status','publish_status'):
            if key in result:
                lines.append(f"- {key}: {result[key]}")
        if result.get('recipe_names'):
            lines.append(f"- recipe_names: {json.dumps(result['recipe_names'], ensure_ascii=False)}")
        if result.get('finish_items'):
            lines.append(f"- finish_items: {json.dumps(result['finish_items'], ensure_ascii=False)}")
        if result.get('details'):
            lines.append(f"- details: {json.dumps(result['details'], ensure_ascii=False)}")
        if result.get('errors'):
            lines.append(f"- errors: {json.dumps(result['errors'], ensure_ascii=False)}")
        lines.append('')
    REPORT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'REPORT_WRITTEN {REPORT}')
    raise SystemExit(1 if any_fail else 0)


if __name__ == '__main__':
    main()
