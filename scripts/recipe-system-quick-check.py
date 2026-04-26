import json
import os
import random
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get('RECIPES_E2E_BASE_URL', 'https://restaurant-daily-order.vercel.app').rstrip('/')
REPORT_PATH = Path('/Users/jeff/Documents/New project/output/recipe-system-quick-check-report.md')

CASES = [
    {
        'id': 'single_element_brown_butter',
        'kind': 'import',
        'label': '单个 Element / Brown Butter Sauce',
        'payload': {'type': 'text', 'content': 'BROWN BUTTER SAUCE\nButter 200g\nSage 20g\nSalt 2g\nInstruction:\nMelt butter over medium heat until nutty brown. Add sage and salt. Strain and hold warm.'},
        'expect_min': 1,
    },
    {
        'id': 'basic_library_set',
        'kind': 'import',
        'label': '基础库 / 多个 Backbone',
        'payload': {'type': 'text', 'content': 'BASIC RECIPES\n\nBASIC SUGAR SYRUP\nSugar 500g\nWater 500ml\nInstruction:\nCombine sugar and water. Bring to a boil. Cool and store.\n\nCHICKEN STOCK\nChicken bones 5kg\nOnion 2ea\nInstruction:\nRoast bones lightly. Add vegetables and water. Simmer 4 hours. Strain and chill.\n\nCLARIFIED BUTTER\nButter 2kg\nInstruction:\nMelt gently. Skim impurities. Decant the clear butter.'},
        'expect_min': 3,
    },
    {
        'id': 'components_lobster',
        'kind': 'import',
        'label': 'Components 复合菜 / Lobster',
        'payload': {'type': 'text', 'content': 'LOBSTER WITH PUMPKIN AND PEAR\n\nComponents:\n- Lobster Brine\n- Lobster Sauce\n- Pumpkin Puree\n- Pear Gel\n- Pear Chips\n\nLobster Brine\nWater 1000g\nSalt 17g\nBay leaf 2pcs\nInstruction:\nBring water and salt to a boil. Add bay leaf. Cool completely and brine the lobster.\n\nLobster Sauce\nChicken stock 500g\nLobster stock 500g\nButter 80g\nInstruction:\nReduce both stocks by half. Whisk in butter. Season and hold warm.\n\nPumpkin Puree\nPumpkin 500g\nButter 20g\nInstruction:\nRoast pumpkin until tender. Blend with butter until smooth.\n\nPear Gel\nPear juice 200g\nAgar 2g\nInstruction:\nBring juice and agar to a boil. Set cold. Blend smooth.\n\nPear Chips\nPear 2ea\nInstruction:\nSlice thinly. Dehydrate until crisp.'},
        'expect_min': 4,
    },
    {
        'id': 'cookbook_caviar',
        'kind': 'import',
        'label': 'Cookbook 复合菜 / Caviar',
        'payload': {'type': 'text', 'content': 'CAVIAR WITH CORN AND BONITO\nServes 8\n\nBONITO BAVAROIS\n45 g bonito flakes\n450 g cream\nInstruction:\nInfuse cream with bonito overnight. Strain. Fold with whipped cream and chill until set.\n\nCORN BAVAROIS\n350 g corn juice\n120 g cream\nInstruction:\nReduce corn juice. Fold with whipped cream. Chill until set.\n\nTO FINISH\n56 g caviar\nOnion blossoms\nInstruction:\nQuenelle both bavarois on the plate. Add caviar. Garnish with onion blossoms.'},
        'expect_min': 2,
    },
    {
        'id': 'direct_element_create',
        'kind': 'direct',
        'label': '直接创建单个 Element',
    },
]


def req(method, path, payload=None, timeout=60):
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
    return f"_Q{int(time.time())}_{random.randint(1000,9999)}_{normalize_code(case_id)}"


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
        preview['elements'] = [{**item, 'dish_code': code_map.get(str(item.get('dish_code'))) or item.get('dish_code')} for item in preview['elements']]
    if preview and preview.get('composite'):
        preview['composite']['dish_code'] = f"{normalize_code(preview['composite'].get('dish_code') or preview['composite'].get('dish_name') or 'COMPOSITE')}{suffix}"[:120]
        if not str(preview['composite'].get('menu_cycle') or '').strip():
            preview['composite']['menu_cycle'] = '2026春夏验收'
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
    return {'actor_email': actor_email, 'draft_items': draft_items, 'v3_preview': preview, 'auto_submit': True}


def find_users():
    status, data = req('GET', '/api/recipe-users', None, timeout=20)
    users = (data.get('data') or []) if status == 200 else []
    actor = next((u for u in users if u.get('role') == 'OWNER'), None) or next((u for u in users if u.get('role') == 'EDITOR'), None) or (users[0] if users else None)
    reviewer = next((u for u in users if u.get('role') == 'REVIEWER'), None) or next((u for u in users if u.get('role') == 'OWNER'), None) or (users[0] if users else None)
    return actor, reviewer


def delete_recipe(recipe_id, actor_email):
    return req('DELETE', f'/api/recipes/{recipe_id}', {'actor': actor_email}, timeout=30)


def run_import_case(case, actor_email, reviewer_email):
    print(f"CASE {case['id']} start", flush=True)
    result = {'id': case['id'], 'label': case['label'], 'ok': True, 'steps': [], 'cleanup': []}
    s1, d1 = req('POST', '/api/recipes/import', {'actor_email': actor_email, **case['payload']}, timeout=90)
    result['steps'].append({'step': 'import', 'status': s1, 'ok': 200 <= s1 < 300, 'detail': d1.get('error') or f"count={d1.get('count', 0)}"})
    if s1 != 200 or int(d1.get('count') or 0) < int(case.get('expect_min') or 1):
        result['ok'] = False
        return result
    payload = build_confirm_payload(d1, case['id'], actor_email)
    s2, d2 = req('POST', '/api/recipes/import/confirm', payload, timeout=120)
    result['steps'].append({'step': 'confirm+submit', 'status': s2, 'ok': 200 <= s2 < 300, 'detail': f"created={len(d2.get('created') or [])} submitted={len(d2.get('submitted') or [])}"})
    if s2 != 200:
        result['ok'] = False
        return result
    created = d2.get('created') or []
    submitted = d2.get('submitted') or []
    for row in created:
        recipe_id = int(row.get('recipe_id') or 0)
        version_id = int(row.get('version_id') or 0)
        s_detail, d_detail = req('GET', f'/api/recipes/{recipe_id}', None, timeout=30)
        detail = d_detail.get('data') or {}
        versions = detail.get('versions') or []
        version = next((v for v in versions if int(v.get('id') or 0) == version_id), versions[0] if versions else None)
        record = parse_record(version)
        entity_kind = detail.get('entity_kind')
        if entity_kind == 'ELEMENT':
            ok = s_detail == 200 and len(record.get('ingredients') or []) > 0 and len(record.get('steps') or []) > 0
            detail_msg = f"ELEMENT ing={len(record.get('ingredients') or [])} step={len(record.get('steps') or [])}"
        elif entity_kind == 'COMPOSITE':
            ok = s_detail == 200 and len(record.get('assembly_components') or []) > 0 and len(record.get('assembly_steps') or []) > 0
            detail_msg = f"COMPOSITE comp={len(record.get('assembly_components') or [])} step={len(record.get('assembly_steps') or [])}"
        else:
            ok = False
            detail_msg = 'unknown detail'
        result['steps'].append({'step': f'detail:{recipe_id}', 'status': s_detail, 'ok': ok, 'detail': detail_msg})
        if not ok:
            result['ok'] = False
    for row in submitted:
        version_id = int(row.get('version_id') or 0)
        s3, d3 = req('POST', f'/api/recipes/versions/{version_id}/review', {'reviewer': reviewer_email, 'decision': 'approve', 'review_note': 'quick self-generated pass'}, timeout=30)
        result['steps'].append({'step': f'review:{version_id}', 'status': s3, 'ok': 200 <= s3 < 300, 'detail': d3.get('error') or 'approved'})
        if s3 != 200:
            result['ok'] = False
        s4, d4 = req('POST', f'/api/recipes/versions/{version_id}/publish', {'publisher': reviewer_email}, timeout=30)
        result['steps'].append({'step': f'publish:{version_id}', 'status': s4, 'ok': 200 <= s4 < 300, 'detail': d4.get('error') or ((d4.get('bangwagong') or {}).get('error')) or 'published'})
        if s4 != 200:
            result['ok'] = False
    for row in created:
        recipe_id = int(row.get('recipe_id') or 0)
        s_del, _ = delete_recipe(recipe_id, actor_email)
        result['cleanup'].append({'recipe_id': recipe_id, 'status': s_del, 'ok': 200 <= s_del < 300})
        if s_del != 200:
            result['ok'] = False
    print(f"CASE {case['id']} done -> {'PASS' if result['ok'] else 'FAIL'}", flush=True)
    return result


def run_direct_case(actor_email, reviewer_email):
    print('CASE direct_element_create start', flush=True)
    result = {'id': 'direct_element_create', 'label': '直接创建单个 Element', 'ok': True, 'steps': [], 'cleanup': []}
    suffix = unique_suffix('direct_element_create')
    payload = {
        'entity_kind': 'ELEMENT',
        'code': f'DIRECT_ELEMENT{suffix}'[:120],
        'name': f'Direct Element {suffix}'[:120],
        'description': 'quick self-generated direct create',
        'business_type': 'BACKBONE',
        'technique_family': 'SAUCE',
        'menu_cycle': '',
        'change_note': 'quick self-generated direct create',
        'created_by': actor_email,
        'yield': '1 batch',
        'allergens': [],
        'diet_flags': [],
        'ingredients': [{'name': 'Butter', 'quantity': '200', 'unit': 'g', 'note': ''}, {'name': 'Sage', 'quantity': '20', 'unit': 'g', 'note': ''}],
        'steps': [{'step_no': 1, 'action': 'Brown the butter gently.', 'time_sec': 120}, {'step_no': 2, 'action': 'Add sage and strain.', 'time_sec': 60}]
    }
    s1, d1 = req('POST', '/api/recipes', payload, timeout=30)
    result['steps'].append({'step': 'create', 'status': s1, 'ok': s1 in (200, 201), 'detail': d1.get('error') or 'created'})
    if s1 not in (200, 201):
        result['ok'] = False
        return result
    recipe_id = int(((d1.get('data') or {}).get('id')) or 0)
    s2, d2 = req('GET', f'/api/recipes/{recipe_id}', None, timeout=30)
    detail = d2.get('data') or {}
    version = (detail.get('versions') or [None])[0]
    version_id = int((version or {}).get('id') or 0)
    record = parse_record(version)
    ok = s2 == 200 and len(record.get('ingredients') or []) > 0 and len(record.get('steps') or []) > 0
    result['steps'].append({'step': 'detail', 'status': s2, 'ok': ok, 'detail': f"ELEMENT ing={len(record.get('ingredients') or [])} step={len(record.get('steps') or [])}"})
    if not ok:
        result['ok'] = False
    if version_id:
        s3, d3 = req('POST', f'/api/recipes/versions/{version_id}/submit', {'actor_email': actor_email}, timeout=30)
        result['steps'].append({'step': 'submit', 'status': s3, 'ok': 200 <= s3 < 300, 'detail': d3.get('error') or 'submitted'})
        if s3 != 200:
            result['ok'] = False
        s4, d4 = req('POST', f'/api/recipes/versions/{version_id}/review', {'reviewer': reviewer_email, 'decision': 'approve', 'review_note': 'quick self-generated pass'}, timeout=30)
        result['steps'].append({'step': 'review', 'status': s4, 'ok': 200 <= s4 < 300, 'detail': d4.get('error') or 'approved'})
        if s4 != 200:
            result['ok'] = False
        s5, d5 = req('POST', f'/api/recipes/versions/{version_id}/publish', {'publisher': reviewer_email}, timeout=30)
        result['steps'].append({'step': 'publish', 'status': s5, 'ok': 200 <= s5 < 300, 'detail': d5.get('error') or ((d5.get('bangwagong') or {}).get('error')) or 'published'})
        if s5 != 200:
            result['ok'] = False
    s6, _ = delete_recipe(recipe_id, actor_email)
    result['cleanup'].append({'recipe_id': recipe_id, 'status': s6, 'ok': 200 <= s6 < 300})
    if s6 != 200:
        result['ok'] = False
    print(f"CASE direct_element_create done -> {'PASS' if result['ok'] else 'FAIL'}", flush=True)
    return result


def main():
    status, runtime = req('GET', '/api/runtime/status', None, timeout=20)
    actor, reviewer = find_users()
    if not actor or not reviewer:
        raise SystemExit('users unavailable')
    results = []
    for case in CASES[:-1]:
        results.append(run_import_case(case, actor['email'], reviewer['email']))
    results.append(run_direct_case(actor['email'], reviewer['email']))
    pass_count = sum(1 for r in results if r['ok'])
    lines = []
    lines.append('# 自造样本快速自动测试结果')
    lines.append('')
    lines.append(f'- 日期: {time.strftime("%Y-%m-%d %H:%M:%S")}')
    lines.append(f'- 环境: {BASE_URL}')
    lines.append(f"- runtime: {(runtime.get('data') or {}).get('recipe_store', {}).get('mode', 'unknown')} / {(runtime.get('data') or {}).get('recipe_store', {}).get('provider', 'unknown')}")
    lines.append(f"- 操作人: {actor['email']}")
    lines.append(f"- 审批/发布人: {reviewer['email']}")
    lines.append('')
    lines.append('## 总结')
    lines.append('')
    lines.append(f'- 通过: {pass_count}/{len(results)}')
    lines.append(f'- 失败: {len(results) - pass_count}/{len(results)}')
    lines.append('')
    for item in results:
        lines.append(f"## {item['label']}")
        lines.append('')
        lines.append(f"- 结果: {'PASS' if item['ok'] else 'FAIL'}")
        for step in item['steps']:
            lines.append(f"- {step['step']}: {'PASS' if step['ok'] else 'FAIL'} ({step['status']}) - {step['detail']}")
        if item['cleanup']:
            cleanup_ok = all(row['ok'] for row in item['cleanup'])
            cleanup_text = ', '.join([f"{row['recipe_id']}:{row['status']}" for row in item['cleanup']])
            lines.append(f"- cleanup: {'PASS' if cleanup_ok else 'FAIL'} ({cleanup_text})")
        lines.append('')
    REPORT_PATH.write_text('\n'.join(lines), encoding='utf-8')
    print('\n'.join(lines), flush=True)

if __name__ == '__main__':
    main()
