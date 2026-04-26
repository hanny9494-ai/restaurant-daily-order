import base64
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


BASE_URL = os.environ.get("RECIPES_E2E_BASE_URL", "https://restaurant-daily-order.vercel.app").rstrip("/")
ACTOR_EMAIL = os.environ.get("RECIPES_E2E_ACTOR", "owner@restaurant.local")
REVIEWER_EMAIL = os.environ.get("RECIPES_E2E_REVIEWER", "manager@restaurant.local")
REPORT_PATH = Path(os.getcwd()) / "output" / "recipe-fullchain-e2e-report.md"


def req(method, path, payload=None, timeout=45):
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(f"{BASE_URL}{path}", data=body, method=method)
    if body is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            try:
                data = json.loads(raw) if raw else {}
            except Exception:
                data = {"raw": raw}
            return response.status, data
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="ignore")
        try:
            data = json.loads(raw) if raw else {}
        except Exception:
            data = {"raw": raw}
        return error.code, data
    except Exception as error:
        return 599, {"error": "REQUEST_FAILED", "detail": str(error)}


def wait_for_runtime():
    for _ in range(10):
        status, data = req("GET", "/api/runtime/status", None, timeout=15)
        if status == 200:
            return data
        time.sleep(1)
    raise SystemExit("runtime status not reachable")


def load_docx_base64(file_path):
    p = Path(file_path)
    if not p.exists():
        return None
    return base64.b64encode(p.read_bytes()).decode("ascii")


CASES = [
    {
        "id": "composite_lobster_text",
        "kind": "import",
        "label": "复合菜 / Components 文本",
        "expect_mode": "COMPOSITE",
        "expect_min": 5,
        "chain_target": "composite",
        "payload": {
            "type": "text",
            "content": "\n".join([
                "Lobster",
                "",
                "Components:",
                "- Lobster Brine",
                "- Lobster Sauce",
                "- Pumpkin Puree",
                "- Pear Gel",
                "- Yellow Daisy",
                "",
                "Lobster Brine",
                "Water",
                "1000g",
                "Salt",
                "17g",
                "Instruction:",
                "Boil water. Add all ingredients except final aromatics and simmer 30 mins. Infuse 10 mins. Blend and strain.",
                "",
                "Lobster Sauce",
                "Water",
                "500g",
                "Chicken stock",
                "500g",
                "Instruction:",
                "Sweat aromatics. Add stock. Simmer 40 mins. Strain and hold.",
                "",
                "Pumpkin Puree",
                "Pumpkin",
                "500g",
                "Instruction:",
                "Roast until soft. Blend smooth.",
                "",
                "Pear Gel",
                "Pear juice",
                "200g",
                "Agar",
                "1%",
                "Instruction:",
                "Boil with agar. Chill and blend.",
                "",
                "Yellow Daisy"
            ])
        }
    },
    {
        "id": "basic_library_text",
        "kind": "import",
        "label": "基础库 / 多个 backbone 文本",
        "expect_min": 3,
        "chain_target": "first-element",
        "payload": {
            "type": "text",
            "content": "\n".join([
                "BASIC RECIPES",
                "",
                "BASIC SUGAR SYRUP",
                "Sugar 500g",
                "Water 500ml",
                "Instruction:",
                "Combine sugar and water. Bring to boil. Cool and store.",
                "",
                "CHICKEN STOCK",
                "Chicken bones 5kg",
                "Onion 2ea",
                "Instruction:",
                "Sweat vegetables. Add bones and water. Simmer 4 hours. Strain.",
                "",
                "CLARIFIED BUTTER",
                "Butter 2kg",
                "Instruction:",
                "Melt gently. Skim impurities. Decant clear butter."
            ])
        }
    },
    {
        "id": "cookbook_caviar",
        "kind": "import",
        "label": "Cookbook 复合菜 / Caviar",
        "expect_mode": "COMPOSITE",
        "expect_min": 2,
        "chain_target": "composite",
        "payload": {
            "type": "text",
            "content": "\n".join([
                "CAVIAR WITH CORN AND BONITO",
                "Serves 8",
                "",
                "BONITO BAVAROIS",
                "45 g bonito flakes",
                "450 g cream",
                "Instruction:",
                "Infuse cream overnight. Strain. Bloom gelatin. Fold whipped cream. Chill until set.",
                "",
                "CORN BAVAROIS",
                "350 g corn juice",
                "120 g cream",
                "Instruction:",
                "Reduce corn juice. Add gelatin. Fold whipped cream. Chill until set.",
                "",
                "TO FINISH",
                "56 g caviar",
                "Onion blossoms",
                "Instruction:",
                "Quenelle both bavarois. Add caviar. Garnish with onion blossoms."
            ])
        }
    },
    {
        "id": "csv_components",
        "kind": "import",
        "label": "CSV 组件导入",
        "expect_min": 2,
        "chain_target": "first-element",
        "payload": {
            "type": "csv",
            "content": "\n".join([
                "Section,Name,Qty",
                "Components,Lemon Curd,",
                "Components,Crust,",
                "Lemon Curd,Lemon juice,200g",
                "Lemon Curd,Sugar,120g",
                "Lemon Curd,Instruction,heat and whisk then cool",
                "Crust,Flour,300g",
                "Crust,Butter,180g",
                "Crust,Instruction,bake 25 mins"
            ])
        }
    },
    {
        "id": "markdown_single",
        "kind": "import",
        "label": "Markdown 表格单元素",
        "expect_mode": "SINGLE_ELEMENT",
        "expect_min": 1,
        "chain_target": "first-element",
        "payload": {
            "type": "text",
            "content": "\n".join([
                "Brown Butter Sauce",
                "",
                "| Ingredient | Qty |",
                "| --- | --- |",
                "| Butter | 200g |",
                "| Sage | 20g |",
                "",
                "Instruction:",
                "Melt butter until nutty. Add sage. Strain and hold warm."
            ])
        }
    },
    {
        "id": "docx_lobster",
        "kind": "import",
        "label": "DOCX / Lobster",
        "optional": True,
        "expect_mode": "COMPOSITE",
        "expect_min": 4,
        "chain_target": "composite",
        "payload": None
    },
    {
        "id": "single_element_direct",
        "kind": "direct",
        "label": "单个 Element 直接录入"
    }
]


docx = load_docx_base64("/Users/jeff/Downloads/Lobster.docx")
if docx:
    for item in CASES:
        if item["id"] == "docx_lobster":
            item["payload"] = {"type": "docx", "content": docx}


def build_confirm_payload(import_data, case_id):
    suffix = f"_E2E_{case_id.upper()}_{int(time.time())}_{random.randint(1000,9999)}"
    recipes = json.loads(json.dumps(import_data.get("recipes", [])))
    preview = json.loads(json.dumps(import_data.get("v3_preview"))) if import_data.get("v3_preview") else None
    code_map = {}

    for recipe in recipes:
      original = str(recipe.get("meta", {}).get("dish_code") or "AUTO")
      next_code = f"{original}{suffix}"[:120]
      recipe["meta"]["dish_code"] = next_code
      code_map[original] = next_code

    draft_items = []
    for recipe in recipes:
        draft_items.append({
            "dish_name": recipe["meta"]["dish_name"],
            "dish_code": recipe["meta"]["dish_code"],
            "business_type": recipe["meta"].get("business_type") or recipe["meta"].get("recipe_type"),
            "technique_family": recipe["meta"].get("technique_family") or "OTHER",
            "menu_cycle": recipe["meta"].get("menu_cycle"),
            "plating_image_url": recipe["meta"].get("plating_image_url") or "",
            "yield": recipe.get("production", {}).get("yield") or recipe.get("production", {}).get("servings") or "1份",
            "net_yield_rate": recipe.get("production", {}).get("net_yield_rate", 1),
            "allergens": recipe.get("allergens", []),
            "diet_flags": recipe.get("diet_flags", []),
            "ingredients": recipe.get("ingredients", []),
            "steps": recipe.get("steps", [])
        })

    if preview and preview.get("elements"):
        for element in preview["elements"]:
            original = str(element.get("dish_code") or "AUTO")
            element["dish_code"] = code_map.get(original, f"{original}{suffix}"[:120])

    if preview and preview.get("composite"):
        composite_code = str(preview["composite"].get("dish_code") or "AUTO_COMPOSITE")
        preview["composite"]["dish_code"] = f"{composite_code}{suffix}"[:120]
        comps = preview["composite"].get("assembly_components") or []
        for component in comps:
            child_code = component.get("child_code")
            if child_code:
                component["child_code"] = code_map.get(str(child_code), f"{child_code}{suffix}"[:120])

    return {
        "actor_email": ACTOR_EMAIL,
        "draft_items": draft_items,
        "v3_preview": preview
    }


def get_active_version(detail_data):
    versions = detail_data.get("data", {}).get("versions", [])
    if not versions:
        return None
    active_status = detail_data.get("data", {}).get("active_status")
    for version in versions:
        if version.get("status") == active_status:
            return version
    return versions[0]


def parse_record(version):
    raw = version.get("recipe_record_json") if version else None
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return raw or {}


def run_chain(version_id):
    submit = req("POST", f"/api/recipes/versions/{version_id}/submit", {"actor_email": ACTOR_EMAIL})
    review = req("POST", f"/api/recipes/versions/{version_id}/review", {"reviewer": REVIEWER_EMAIL, "decision": "approve", "review_note": "e2e pass"})
    publish = req("POST", f"/api/recipes/versions/{version_id}/publish", {"publisher": REVIEWER_EMAIL})
    return {"submit": submit, "review": review, "publish": publish}


def run_import_case(case):
    errors = []
    status, import_data = req("POST", "/api/recipes/import", {"actor_email": ACTOR_EMAIL, **case["payload"]})
    result = {
        "fixture": case,
        "import_status": status,
        "import_data": import_data,
        "errors": errors
    }
    if status != 200:
        errors.append(f"import failed {status} {import_data.get('error','')}".strip())
        return result

    if case.get("expect_min") and int(import_data.get("count") or 0) < case["expect_min"]:
        errors.append(f"import count too low {import_data.get('count')}")

    if case.get("expect_mode"):
        actual_mode = ((import_data.get("v3_preview") or {}).get("mode"))
        if actual_mode != case["expect_mode"]:
            errors.append(f"mode mismatch expected={case['expect_mode']} actual={actual_mode}")

    confirm_payload = build_confirm_payload(import_data, case["id"])
    confirm_status, confirm_data = req("POST", "/api/recipes/import/confirm", confirm_payload)
    result["confirm_status"] = confirm_status
    result["confirm_data"] = confirm_data
    created = confirm_data.get("created", []) if confirm_status == 200 else []
    result["created"] = created
    if confirm_status != 200:
        errors.append(f"confirm failed {confirm_status} {confirm_data.get('error','')}".strip())
        return result

    details = []
    for row in created:
        d_status, d_data = req("GET", f"/api/recipes/{row['recipe_id']}")
        entity_kind = ((d_data.get("data") or {}).get("entity_kind") if d_status == 200 else None)
        details.append({"status": d_status, "data": d_data, "row": row, "entity_kind": entity_kind})
        if d_status != 200:
            errors.append(f"detail failed recipe_id={row['recipe_id']} status={d_status}")
            continue
        version = get_active_version(d_data)
        record = parse_record(version)
        if entity_kind == "ELEMENT":
            name = d_data.get("data", {}).get("name")
            imported = None
            for candidate in import_data.get("recipes", []):
                if candidate.get("meta", {}).get("dish_name") == name:
                    imported = candidate
                    break
            if imported:
                expected_steps = len(imported.get("steps", []))
                actual_steps = len(record.get("steps", []))
                if expected_steps != actual_steps:
                    errors.append(f"step mismatch {name}: import={expected_steps} stored={actual_steps}")
        if entity_kind == "COMPOSITE":
            expected_assembly = len(((import_data.get("v3_preview") or {}).get("composite") or {}).get("assembly_steps") or [])
            actual_assembly = len(record.get("assembly_steps", []))
            if expected_assembly != actual_assembly:
                errors.append(f"assembly step mismatch import={expected_assembly} stored={actual_assembly}")

    result["details"] = details

    chain_target = None
    if case.get("chain_target") == "composite":
        for item in details:
            if item.get("entity_kind") == "COMPOSITE" and item["status"] == 200:
                chain_target = item
                break
    else:
        for item in details:
            if item.get("entity_kind") == "ELEMENT" and item["status"] == 200:
                chain_target = item
                break

    if chain_target:
        version = get_active_version(chain_target["data"])
        if version and version.get("id"):
            chain = run_chain(version["id"])
            result["chain"] = chain
            for key in ("submit", "review", "publish"):
                chain_status, chain_data = chain[key]
                if chain_status != 200:
                    errors.append(f"{key} failed {chain_status} {chain_data.get('error','')}".strip())

    return result


def run_direct_case(case):
    errors = []
    code = f"TEST_DIRECT_{int(time.time())}_{random.randint(1000,9999)}"
    create_status, create_data = req("POST", "/api/recipes", {
        "code": code,
        "name": "Direct Element E2E",
        "business_type": "BACKBONE",
        "yield": "1 batch",
        "instructions": "Whisk all ingredients until smooth. Hold warm.",
        "created_by": ACTOR_EMAIL,
        "ingredients": [
            {"name": "Butter", "quantity": "120", "unit": "g", "note": ""},
            {"name": "Cream", "quantity": "240", "unit": "g", "note": ""}
        ]
    })
    result = {
        "fixture": case,
        "create_status": create_status,
        "create_data": create_data,
        "errors": errors
    }
    if create_status not in (200, 201):
        errors.append(f"create failed {create_status} {create_data.get('error','')}".strip())
        return result

    recipe_id = create_data.get("data", {}).get("id")
    version = (create_data.get("data", {}).get("versions") or [None])[0]
    if not recipe_id or not version or not version.get("id"):
        errors.append("create response missing recipe/version id")
        return result

    detail_status, detail_data = req("GET", f"/api/recipes/{recipe_id}")
    result["detail_status"] = detail_status
    result["detail_data"] = detail_data
    if detail_status != 200:
        errors.append(f"detail failed {detail_status}")
    else:
        active = get_active_version(detail_data)
        record = parse_record(active)
        if len(record.get("steps", [])) != 1:
            errors.append(f"direct element step mismatch expected=1 actual={len(record.get('steps', []))}")

    chain = run_chain(version["id"])
    result["chain"] = chain
    for key in ("submit", "review", "publish"):
        chain_status, chain_data = chain[key]
        if chain_status != 200:
            errors.append(f"{key} failed {chain_status} {chain_data.get('error','')}".strip())

    return result


def main():
    runtime = wait_for_runtime()
    lines = [
        "# Recipe Fullchain E2E Report",
        "",
        f"Base URL: {BASE_URL}",
        f"Actor: {ACTOR_EMAIL}",
        f"Reviewer: {REVIEWER_EMAIL}",
        f"Generated: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}",
        f"Runtime: {json.dumps(runtime, ensure_ascii=False)}",
        ""
    ]

    results = []
    has_failure = False

    for case in CASES:
        if case["kind"] == "import" and case.get("optional") and not case.get("payload"):
            continue
        print(f"CASE_START {case['id']}")
        result = run_import_case(case) if case["kind"] == "import" else run_direct_case(case)
        results.append(result)
        ok = len(result["errors"]) == 0
        if not ok:
            has_failure = True
        print(f"CASE_DONE {case['id']} ok={ok}")
        lines.append(f"## {case['id']}")
        lines.append(f"- label: {case['label']}")
        lines.append(f"- ok: {ok}")
        if "import_status" in result:
            lines.append(f"- import_status: {result['import_status']}")
            lines.append(f"- import_count: {result.get('import_data', {}).get('count', 0)}")
            lines.append(f"- mode: {(result.get('import_data', {}).get('v3_preview') or {}).get('mode', '-')}")
        if "confirm_status" in result:
            lines.append(f"- confirm_status: {result['confirm_status']}")
            lines.append(f"- created_count: {len(result.get('created', []))}")
        if "create_status" in result:
            lines.append(f"- create_status: {result['create_status']}")
        if result.get("chain"):
            lines.append(f"- submit_status: {result['chain']['submit'][0]}")
            lines.append(f"- review_status: {result['chain']['review'][0]}")
            lines.append(f"- publish_status: {result['chain']['publish'][0]}")
        if result["errors"]:
            lines.append(f"- errors: {json.dumps(result['errors'], ensure_ascii=False)}")
        lines.append("")

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"REPORT_WRITTEN {REPORT_PATH}")
    if has_failure:
        sys.exit(1)


if __name__ == "__main__":
    main()
