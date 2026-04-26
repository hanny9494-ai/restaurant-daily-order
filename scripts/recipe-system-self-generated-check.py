import json
import os
import random
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get('RECIPES_E2E_BASE_URL', 'https://restaurant-daily-order.vercel.app').rstrip('/')
REPORT_PATH = Path('/Users/jeff/Documents/New project/output/recipe-system-self-generated-check-report.md')

CASES = [
    {
        'id': 'single_element_brown_butter',
        'kind': 'import',
        'label': '单个 Element / Brown Butter Sauce',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'BROWN BUTTER SAUCE',
                'Butter 200g',
                'Sage 20g',
                'Salt 2g',
                'Instruction:',
                'Melt butter over medium heat until nutty brown. Add sage and salt. Strain and hold warm.'
            ])
        },
        'expect_min': 1,
    },
    {
        'id': 'basic_library_set',
        'kind': 'import',
        'label': '基础库 / 多个 Backbone',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'BASIC RECIPES',
                '',
                'BASIC SUGAR SYRUP',
                'Sugar 500g',
                'Water 500ml',
                'Instruction:',
                'Combine sugar and water. Bring to a boil. Cool and store.',
                '',
                'CHICKEN STOCK',
                'Chicken bones 5kg',
                'Onion 2ea',
                'Instruction:',
                'Roast bones lightly. Add vegetables and water. Simmer 4 hours. Strain and chill.',
                '',
                'CLARIFIED BUTTER',
                'Butter 2kg',
                'Instruction:',
                'Melt gently. Skim impurities. Decant the clear butter.'
            ])
        },
        'expect_min': 3,
    },
    {
        'id': 'components_lobster',
        'kind': 'import',
        'label': 'Components 复合菜 / Lobster',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'LOBSTER WITH PUMPKIN AND PEAR',
                '',
                'Components:',
                '- Lobster Brine',
                '- Lobster Sauce',
                '- Pumpkin Puree',
                '- Pear Gel',
                '- Pear Chips',
                '',
                'Lobster Brine',
                'Water 1000g',
                'Salt 17g',
                'Bay leaf 2pcs',
                'Instruction:',
                'Bring water and salt to a boil. Add bay leaf. Cool completely and brine the lobster.',
                '',
                'Lobster Sauce',
                'Chicken stock 500g',
                'Lobster stock 500g',
                'Butter 80g',
                'Instruction:',
                'Reduce both stocks by half. Whisk in butter. Season and hold warm.',
                '',
                'Pumpkin Puree',
                'Pumpkin 500g',
                'Butter 20g',
                'Instruction:',
                'Roast pumpkin until tender. Blend with butter until smooth.',
                '',
                'Pear Gel',
                'Pear juice 200g',
                'Agar 2g',
                'Instruction:',
                'Bring juice and agar to a boil. Set cold. Blend smooth.',
                '',
                'Pear Chips',
                'Pear 2ea',
                'Instruction:',
                'Slice thinly. Dehydrate until crisp.'
            ])
        },
        'expect_min': 4,
    },
    {
        'id': 'cookbook_caviar',
        'kind': 'import',
        'label': 'Cookbook 复合菜 / Caviar',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'CAVIAR WITH CORN AND BONITO',
                'Serves 8',
                '',
                'BONITO BAVAROIS',
                '45 g bonito flakes',
                '450 g cream',
                'Instruction:',
                'Infuse cream with bonito overnight. Strain. Fold with whipped cream and chill until set.',
                '',
                'CORN BAVAROIS',
                '350 g corn juice',
                '120 g cream',
                'Instruction:',
                'Reduce corn juice. Fold with whipped cream. Chill until set.',
                '',
                'TO FINISH',
                '56 g caviar',
                'Onion blossoms',
                'Instruction:',
                'Quenelle both bavarois on the plate. Add caviar. Garnish with onion blossoms.'
            ])
        },
        'expect_min': 2,
    },
    {
        'id': 'tomato_salad_cookbook',
        'kind': 'import',
        'label': 'Cookbook 菜 / Tomato Salad',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'TOMATO SALAD WITH BASIL AND SHALLOT',
                '',
                'TOMATO SAUCE',
                'Tomato water 500g',
                'Basil 10g',
                'Instruction:',
                'Infuse tomato water with basil. Blend and strain.',
                '',
                'TOMATO BAVAROIS',
                'Tomato water 300g',
                'Cream 300g',
                'Instruction:',
                'Reduce tomato water, fold with whipped cream, and chill.',
                '',
                'RYE CROUTONS',
                'Rye bread 100g',
                'Butter 20g',
                'Instruction:',
                'Toast rye bread with butter until crisp.',
                '',
                'TO FINISH',
                'Basil tips',
                'Basil blooms',
                'Cracked black pepper',
                'Instruction:',
                'Pipe bavarois, top with tomato salad, garnish with basil and cracked pepper.'
            ])
        },
        'expect_min': 3,
    },
    {
        'id': 'nonstandard_bullets',
        'kind': 'import',
        'label': '非标准 bullet',
        'payload': {
            'type': 'text',
            'content': '\n'.join([
                'Dish: Spring Herb Plate',
                '',
                '• Herb Oil',
                'Parsley 100g',
                'Olive oil 300g',
                'Instruction:',
                'Blend parsley with warm oil. Strain.',
                '',
                '• Lemon Cream',
                'Cream 250g',
                'Lemon juice 30g',
                'Instruction:',
                'Whisk lemon juice into cream and chill.',
                '',
                '• Crunch',
                'Bread crumbs 150g',
                'Butter 40g',
                'Instruction:',
                'Toast until golden.'
            ])
        },
        'expect_min': 3,
    },
]


def req(method, path, payload=None, timeout=90):
    body = None if payload is None else json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(f'{BASE_URL}{path}', data=body, method=method)
    if body is not None:
        request.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode('utf-8')
            try:
                data = json.loads(raw) if raw else {}
            except Exception:
                data = {'raw': raw}
            return response.status, data
    except urllib.error.HTTPError as error:
        raw = error.read().decode('utf-8', errors='ignore')
        try:
            data = json.loads(raw) if raw else {}
        except Exception:
            data = {'raw': raw}
        return error.code, data


def normalize_code(value):
    import re
    value = str(value or '').strip().upper()
    value = re.sub(r'[^A-Z0-9]+', '_', value)
    value = re.sub(r'_+', '_', value)
    return value.strip('_')


def unique_suffix(case_id):
    return f"_T{int(time.time())}_{random.randint(1000,9999)}_{normalize_code(case_id)}"


def parse_record(version):
    raw = (version or {}).get('recipe_record_json')
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return raw or {}


def build_confirm_payload(import_data, case_id, actor_email):
    suffix = unique_suffix(case_id)
    recipes = json.loads(json.dumps(import_data.get('recipes') or []))
    preview = json.loads(json.dumps(import_data.get('v3_preview'))) if import_data.get('v3_preview') else None
    code_map = {}
    for recipe in recipes:
        orig = str(((recipe.get('meta') or {}).get('dish_code')) or 'AUTO')
        name = str(((recipe.get('meta') or {}).get('dish_name')) or 'ITEM')
        next_code = f"{normalize_code(orig or name)}{suffix}"[:120]
        recipe['meta']['dish_code'] = next_code
        if (recipe['meta'].get('business_type') or recipe['meta'].get('recipe_type')) == 'MENU' and not str(recipe['meta'].get('menu_cycle') or '').strip():
            recipe['meta']['menu_cycle'] = '2026春夏验收'
        code_map[orig] = next_code
    if preview and preview.get('elements'):
        preview['elements'] = [
            {
                **item,
                'dish_code': code_map.get(str(item.get('dish_code'))) or f"{normalize_code(item.get('dish_code') or item.get('dish_name') or 'ITEM')}{suffix}"[:120]
            }
            for item in preview['elements']
        ]
    if preview and preview.get('composite'):
        preview['composite']['dish_code'] = f"{normalize_code(preview['composite'].get('dish_code') or preview['composite'].get('dish_name') or 'COMPOSITE')}{suffix}"[:120]
        if not str(preview['composite'].get('menu_cycle') or '').strip():
            preview['composite']['menu_cycle'] = '2026春夏验收'
        comps = []
        for comp in preview['composite'].get('assembly_components') or []:
            next_comp = dict(comp)
            if next_comp.get('child_code'):
                next_comp['child_code'] = code_map.get(str(next_comp['child_code'])) or next_comp['child_code']
            comps.append(next_comp)
        preview['composite']['assembly_components'] = comps
    draft_items = []
    for recipe in recipes:
        meta = recipe.get('meta') or {}
        production = recipe.get('production') or {}
        draft_items.append({
            'dish_name': meta.get('dish_name'),
            'dish_code': meta.get('dish_code'),
            'business_type': meta.get('business_type') or meta.get('recipe_type'),
            'technique_family': meta.get('technique_family') or 'OTHER',
            'menu_cycle': meta.get('menu_cycle') or None,
            'plating_image_url': meta.get('plating_image_url') or '',
            'yield': production.get('yield') or production.get('servings') or '1份',
            'net_yield_rate': production.get('net_yield_rate') or 1,
            'allergens': recipe.get('allergens') or [],
            'diet_flags': recipe.get('diet_flags') or [],
            'ingredients': recipe.get('ingredients') or [],
            'steps': recipe.get('steps') or []
        })
    return {
        'actor_email': actor_email,
        'draft_items': draft_items,
        'v3_preview': preview,
        'auto_submit': True,
    }


def find_users():
    status, data = req('GET', '/api/recipe-users', None, timeout=30)
    users = (data.get('data') or []) if status == 200 else []
    actor = next((u for u in users if u.get('role') == 'OWNER'), None) or next((u for u in users if u.get('role') == 'EDITOR'), None) or (users[0] if users else None)
    reviewer = next((u for u in users if u.get('role') == 'REVIEWER'), None) or next((u for u in users if u.get('role') == 'OWNER'), None) or (users[0] if users else None)
    return actor, reviewer


def run_import_case(case, actor_email, reviewer_email):
    result = {'id': case['id'], 'label': case['label'], 'ok': True, 'steps': [], 'cleanup': []}
    s1, d1 = req('POST', '/api/recipes/import', {'actor_email': actor_email, **case['payload']}, timeout=120)
    result['steps'].append({'step': 'import', 'status': s1, 'ok': 200 <= s1 < 300, 'detail': d1.get('error') or f"count={d1.get('count', 0)}"})
    if s1 != 200:
        result['ok'] = False
        return result
    if int(d1.get('count') or 0) < int(case.get('expect_min') or 1):
        result['ok'] = False
        result['steps'].append({'step': 'import_assert', 'status': 0, 'ok': False, 'detail': f"count too low: {d1.get('count', 0)}"})
        return result
    payload = build_confirm_payload(d1, case['id'], actor_email)
    s2, d2 = req('POST', '/api/recipes/import/confirm', payload, timeout=180)
    result['steps'].append({'step': 'confirm+submit', 'status': s2, 'ok': 200 <= s2 < 300, 'detail': f"created={len(d2.get('created') or [])} submitted={len(d2.get('submitted') or [])}"})
    if s2 != 200:
        result['ok'] = False
        return result
    created = d2.get('created') or []
    submitted = d2.get('submitted') or []
    for row in created:
        recipe_id = int(row.get('recipe_id') or 0)
        version_id = int(row.get('version_id') or 0)
        s_detail, d_detail = req('GET', f'/api/recipes/{recipe_id}', None, timeout=60)
        detail = (d_detail.get('data') or {}) if s_detail == 200 else {}
        versions = detail.get('versions') or []
        version = next((v for v in versions if int(v.get('id') or 0) == version_id), versions[0] if versions else None)
        record = parse_record(version)
        entity_kind = detail.get('entity_kind')
        if entity_kind == 'ELEMENT':
            ing_count = len(record.get('ingredients') or [])
            step_count = len(record.get('steps') or [])
            ok = s_detail == 200 and ing_count > 0 and step_count > 0
            detail_text = f"ELEMENT ing={ing_count} step={step_count}"
        elif entity_kind == 'COMPOSITE':
            comp_count = len(record.get('assembly_components') or [])
            step_count = len(record.get('assembly_steps') or [])
            ok = s_detail == 200 and comp_count > 0 and step_count > 0
            detail_text = f"COMPOSITE comp={comp_count} step={step_count}"
        else:
            ok = False
            detail_text = 'UNKNOWN DETAIL SHAPE'
        result['steps'].append({'step': f'detail:{recipe_id}', 'status': s_detail, 'ok': ok, 'detail': detail_text})
        if not ok:
            result['ok'] = False
    for row in submitted:
        version_id = int(row.get('version_id') or 0)
        s3, d3 = req('POST', f'/api/recipes/versions/{version_id}/review', {'reviewer': reviewer_email, 'decision': 'approve', 'review_note': 'self-generated check pass'}, timeout=60)
        result['steps'].append({'step': f'review:{version_id}', 'status': s3, 'ok': 200 <= s3 < 300, 'detail': d3.get('error') or 'approved'})
        if s3 != 200:
            result['ok'] = False
        s4, d4 = req('POST', f'/api/recipes/versions/{version_id}/publish', {'publisher': reviewer_email}, timeout=60)
        result['steps'].append({'step': f'publish:{version_id}', 'status': s4, 'ok': 200 <= s4 < 300, 'detail': d4.get('error') or ((d4.get('bangwagong') or {}).get('error')) or 'published'})
        if s4 != 200:
            result['ok'] = False
    for row in created:
        recipe_id = int(row.get('recipe_id') or 0)
        s_del, _ = req('DELETE', f'/api/recipes/{recipe_id}', {'actor': actor_email}, timeout=60)
        result['cleanup'].append({'recipe_id': recipe_id, 'status': s_del, 'ok': 200 <= s_del < 300})
        if s_del != 200:
            result['ok'] = False
    return result


def run_direct_case(actor_email, reviewer_email):
    result = {'id': 'direct_element_create', 'label': '直接创建单个 Element', 'ok': True, 'steps': [], 'cleanup': []}
    suffix = unique_suffix('direct_element_create')
    payload = {
        'entity_kind': 'ELEMENT',
        'code': f'DIRECT_ELEMENT{suffix}'[:120],
        'name': f'Direct Element {suffix}'[:120],
        'description': 'self-generated direct create',
        'business_type': 'BACKBONE',
        'technique_family': 'SAUCE',
        'menu_cycle': '',
        'change_note': 'self-generated direct create',
        'created_by': actor_email,
        'yield': '1 batch',
        'allergens': [],
        'diet_flags': [],
        'ingredients': [
            {'name': 'Butter', 'quantity': '200', 'unit': 'g', 'note': ''},
            {'name': 'Sage', 'quantity': '20', 'unit': 'g', 'note': ''}
        ],
        'steps': [
            {'step_no': 1, 'action': 'Brown the butter gently.', 'time_sec': 120},
            {'step_no': 2, 'action': 'Add sage and strain.', 'time_sec': 60}
        ]
    }
    s1, d1 = req('POST', '/api/recipes', payload, timeout=60)
    result['steps'].append({'step': 'create', 'status': s1, 'ok': 200 <= s1 < 300, 'detail': d1.get('error') or 'created'})
    if s1 not in (200, 201):
        result['ok'] = False
        return result
    recipe_id = int(((d1.get('data') or {}).get('id')) or 0)
    s2, d2 = req('GET', f'/api/recipes/{recipe_id}', None, timeout=60)
    detail = d2.get('data') or {}
    versions = detail.get('versions') or []
    version = versions[0] if versions else None
    version_id = int((version or {}).get('id') or 0)
    record = parse_record(version)
    ing_count = len(record.get('ingredients') or [])
    step_count = len(record.get('steps') or [])
    ok = s2 == 200 and ing_count > 0 and step_count > 0
    result['steps'].append({'step': 'detail', 'status': s2, 'ok': ok, 'detail': f'ELEMENT ing={ing_count} step={step_count}'})
    if not ok:
        result['ok'] = False
    if version_id:
        s3, d3 = req('POST', f'/api/recipes/versions/{version_id}/submit', {'actor_email': actor_email}, timeout=60)
        result['steps'].append({'step': 'submit', 'status': s3, 'ok': 200 <= s3 < 300, 'detail': d3.get('error') or 'submitted'})
        if s3 != 200:
            result['ok'] = False
        s4, d4 = req('POST', f'/api/recipes/versions/{version_id}/review', {'reviewer': reviewer_email, 'decision': 'approve', 'review_note': 'self-generated check pass'}, timeout=60)
        result['steps'].append({'step': 'review', 'status': s4, 'ok': 200 <= s4 < 300, 'detail': d4.get('error') or 'approved'})
        if s4 != 200:
            result['ok'] = False
        s5, d5 = req('POST', f'/api/recipes/versions/{version_id}/publish', {'publisher': reviewer_email}, timeout=60)
        result['steps'].append({'step': 'publish', 'status': s5, 'ok': 200 <= s5 < 300, 'detail': d5.get('error') or ((d5.get('bangwagong') or {}).get('error')) or 'published'})
        if s5 != 200:
            result['ok'] = False
    s6, _ = req('DELETE', f'/api/recipes/{recipe_id}', {'actor': actor_email}, timeout=60)
    result['cleanup'].append({'recipe_id': recipe_id, 'status': s6, 'ok': 200 <= s6 < 300})
    if s6 != 200:
        result['ok'] = False
    return result


def main():
    runtime_status, runtime_data = req('GET', '/api/runtime/status', None, timeout=30)
    actor, reviewer = find_users()
    if not actor or not reviewer:
        raise SystemExit('recipe users unavailable')
    actor_email = actor['email']
    reviewer_email = reviewer['email']
    results = []
    for case in CASES:
        results.append(run_import_case(case, actor_email, reviewer_email))
    results.append(run_direct_case(actor_email, reviewer_email))
    pass_count = sum(1 for item in results if item['ok'])
    lines = []
    lines.append('# 自造样本自动测试结果')
    lines.append('')
    lines.append(f'- 日期: {time.strftime("%Y-%m-%d %H:%M:%S")}')
    lines.append(f'- 环境: {BASE_URL}')
    lines.append(f'- runtime: {(runtime_data.get("data") or {}).get("recipe_store", {}).get("mode", "unknown")} / {(runtime_data.get("data") or {}).get("recipe_store", {}).get("provider", "unknown")}')
    lines.append(f'- 操作人: {actor_email}')
    lines.append(f'- 审批/发布人: {reviewer_email}')
    lines.append('')
    lines.append('## 总结')
    lines.append('')
    lines.append(f'- 通过: {pass_count}/{len(results)}')
    lines.append(f'- 失败: {len(results) - pass_count}/{len(results)}')
    lines.append('')
    for item in results:
        lines.append(f'## {item["label"]}')
        lines.append('')
        lines.append(f'- 结果: {'PASS' if item['ok'] else 'FAIL'}')
        for step in item['steps']:
            lines.append(f"- {step['step']}: {'PASS' if step['ok'] else 'FAIL'} ({step['status']}) - {step['detail']}")
        if item['cleanup']:
            cleanup_ok = all(row['ok'] for row in item['cleanup'])
            lines.append(f"- cleanup: {'PASS' if cleanup_ok else 'FAIL'} ({', '.join([f'{row['recipe_id']}:{row['status']}' for row in item['cleanup']])})")
        lines.append('')
    REPORT_PATH.write_text('\n'.join(lines), encoding='utf-8')
    print('\n'.join(lines))

if __name__ == '__main__':
    main()
