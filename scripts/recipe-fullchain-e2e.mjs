import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Pool } = pg;

const baseUrl = process.env.RECIPES_E2E_BASE_URL || "https://restaurant-daily-order.vercel.app";
const actorEmail = process.env.RECIPES_E2E_ACTOR || "owner@restaurant.local";
const reviewerEmail = process.env.RECIPES_E2E_REVIEWER || "manager@restaurant.local";
const reportPath = path.join(process.cwd(), "output", "recipe-fullchain-e2e-report.md");

const docxPathMap = {
  lobster: "/Users/jeff/Downloads/Lobster.docx",
  basicSauce: "/Users/jeff/Downloads/basic sauce.docx",
  crab: "/Users/jeff/Downloads/Crab.docx"
};

const cases = [
  {
    id: "composite_lobster_text",
    kind: "import",
    label: "复合菜 / Components 文本",
    expect: { minRecipes: 5, mode: "COMPOSITE", fullChain: "composite" },
    payload: {
      type: "text",
      content: [
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
      ].join("\n")
    }
  },
  {
    id: "basic_library_text",
    kind: "import",
    label: "基础库 / 多个 backbone 文本",
    expect: { minRecipes: 3, mode: "ELEMENT_LIBRARY", fullChain: "first-element" },
    payload: {
      type: "text",
      content: [
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
      ].join("\n")
    }
  },
  {
    id: "cookbook_caviar",
    kind: "import",
    label: "Cookbook 复合菜 / Caviar",
    expect: { minRecipes: 2, mode: "COMPOSITE", fullChain: "composite" },
    payload: {
      type: "text",
      content: [
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
      ].join("\n")
    }
  },
  {
    id: "csv_components",
    kind: "import",
    label: "CSV 组件导入",
    expect: { minRecipes: 2, fullChain: "first-element" },
    payload: {
      type: "csv",
      content: [
        "Section,Name,Qty",
        "Components,Lemon Curd,",
        "Components,Crust,",
        "Lemon Curd,Lemon juice,200g",
        "Lemon Curd,Sugar,120g",
        "Lemon Curd,Instruction,heat and whisk then cool",
        "Crust,Flour,300g",
        "Crust,Butter,180g",
        "Crust,Instruction,bake 25 mins"
      ].join("\n")
    }
  },
  {
    id: "markdown_single",
    kind: "import",
    label: "Markdown 表格单元素",
    expect: { minRecipes: 1, mode: "SINGLE_ELEMENT", fullChain: "first-element" },
    payload: {
      type: "text",
      content: [
        "Brown Butter Sauce",
        "",
        "| Ingredient | Qty |",
        "| --- | --- |",
        "| Butter | 200g |",
        "| Sage | 20g |",
        "",
        "Instruction:",
        "Melt butter until nutty. Add sage. Strain and hold warm."
      ].join("\n")
    }
  },
  {
    id: "docx_lobster",
    kind: "import",
    label: "DOCX / Lobster",
    optional: true,
    expect: { minRecipes: 4, mode: "COMPOSITE", fullChain: "composite" },
    payload: maybeDocx(docxPathMap.lobster)
  },
  {
    id: "single_element_direct",
    kind: "direct",
    label: "单个 Element 直接录入",
    expect: { fullChain: "direct-element" }
  }
];

function maybeDocx(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return {
    type: "docx",
    content: fs.readFileSync(filePath).toString("base64")
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, init = {}) {
  const method = init.method || "GET";
  const timeoutSec = String(Math.ceil(Number(process.env.RECIPES_E2E_TIMEOUT_MS || 45000) / 1000));
  const args = ["-sS", "--max-time", timeoutSec, "-X", method];
  const headers = init.headers || {};
  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }
  if (init.body !== undefined) {
    args.push("--data-binary", typeof init.body === "string" ? init.body : String(init.body));
  }
  args.push("-w", "\nHTTP_STATUS:%{http_code}", url);
  const result = spawnSync("curl", args, { encoding: "utf8" });
  if (result.status !== 0) {
    return { ok: false, status: 599, data: { error: "REQUEST_FAILED", detail: (result.stderr || result.stdout || "").trim() } };
  }
  const out = result.stdout || "";
  const match = out.match(/\nHTTP_STATUS:(\d{3})\s*$/);
  const status = match ? Number(match[1]) : 599;
  const bodyText = match ? out.slice(0, match.index) : out;
  let data = {};
  try {
    data = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    data = { raw: bodyText };
  }
  return { ok: status >= 200 && status < 300, status, data };
}

async function waitForBase(url) {
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await fetchJson(`${url}/api/runtime/status`);
      if (res.ok) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

function uniqueSuffix(caseId) {
  return `_E2E_${caseId.toUpperCase()}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function buildUniqueConfirmPayload(importResult, caseId) {
  const suffix = uniqueSuffix(caseId);
  const recipes = Array.isArray(importResult.data?.recipes) ? clone(importResult.data.recipes) : [];
  const v3Preview = importResult.data?.v3_preview ? clone(importResult.data.v3_preview) : null;
  const codeMap = new Map();

  recipes.forEach((recipe) => {
    const original = String(recipe.meta?.dish_code || "AUTO");
    const next = `${original}${suffix}`.slice(0, 120);
    recipe.meta.dish_code = next;
    codeMap.set(original, next);
  });

  const draftItems = recipes.map((recipe) => ({
    dish_name: recipe.meta.dish_name,
    dish_code: recipe.meta.dish_code,
    business_type: recipe.meta.business_type || recipe.meta.recipe_type,
    technique_family: recipe.meta.technique_family || "OTHER",
    menu_cycle: recipe.meta.menu_cycle || null,
    plating_image_url: recipe.meta.plating_image_url || "",
    yield: recipe.production.yield || recipe.production.servings || "1份",
    net_yield_rate: recipe.production.net_yield_rate,
    allergens: recipe.allergens || [],
    diet_flags: recipe.diet_flags || [],
    ingredients: recipe.ingredients || [],
    steps: recipe.steps || []
  }));

  if (v3Preview?.elements) {
    v3Preview.elements = v3Preview.elements.map((item) => ({
      ...item,
      dish_code: codeMap.get(String(item.dish_code)) || `${String(item.dish_code)}${suffix}`.slice(0, 120)
    }));
  }

  if (v3Preview?.composite) {
    const compositeCode = String(v3Preview.composite.dish_code || "AUTO_COMPOSITE");
    v3Preview.composite.dish_code = `${compositeCode}${suffix}`.slice(0, 120);
    v3Preview.composite.assembly_components = Array.isArray(v3Preview.composite.assembly_components)
      ? v3Preview.composite.assembly_components.map((component) => ({
          ...component,
          child_code: component.child_code ? (codeMap.get(String(component.child_code)) || `${String(component.child_code)}${suffix}`.slice(0, 120)) : component.child_code
        }))
      : [];
  }

  return {
    actor_email: actorEmail,
    draft_items: draftItems,
    v3_preview: v3Preview,
    suffix
  };
}

function extractCreatedRows(confirmData) {
  return Array.isArray(confirmData?.created) ? confirmData.created : [];
}

async function getRecipeDetail(recipeId) {
  const result = await fetchJson(`${baseUrl}/api/recipes/${recipeId}`);
  return result;
}

function getActiveVersion(detailData) {
  const versions = Array.isArray(detailData?.data?.versions) ? detailData.data.versions : [];
  if (versions.length < 1) return null;
  const published = versions.find((item) => item.status === detailData?.data?.active_status);
  return published || versions[0];
}

function parseRecord(version) {
  const raw = version?.recipe_record_json;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw || {};
}

async function submitReviewPublish(versionId) {
  const submit = await fetchJson(`${baseUrl}/api/recipes/versions/${versionId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor_email: actorEmail })
  });
  const review = await fetchJson(`${baseUrl}/api/recipes/versions/${versionId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewer: reviewerEmail, decision: "approve", review_note: "e2e pass" })
  });
  const publish = await fetchJson(`${baseUrl}/api/recipes/versions/${versionId}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publisher: reviewerEmail })
  });
  return { submit, review, publish };
}

function makePool() {
  const connectionString = String(process.env.POSTGRES_URL || process.env.DATABASE_URL || "").trim();
  if (!connectionString) return null;
  return new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 5),
    ssl: /sslmode=disable/i.test(connectionString) ? undefined : { rejectUnauthorized: false }
  });
}

async function cleanupRecipeIds(pool, recipeIds) {
  if (!pool || recipeIds.length < 1) return;
  await pool.query("BEGIN");
  try {
    await pool.query("DELETE FROM recipe_sync_logs WHERE recipe_id = ANY($1::bigint[])", [recipeIds]);
    await pool.query("DELETE FROM recipe_version_components WHERE parent_version_id IN (SELECT id FROM recipe_versions WHERE recipe_id = ANY($1::bigint[]))", [recipeIds]);
    await pool.query("DELETE FROM recipe_ingredients WHERE recipe_version_id IN (SELECT id FROM recipe_versions WHERE recipe_id = ANY($1::bigint[]))", [recipeIds]);
    await pool.query("DELETE FROM recipe_versions WHERE recipe_id = ANY($1::bigint[])", [recipeIds]);
    await pool.query("DELETE FROM recipes WHERE id = ANY($1::bigint[])", [recipeIds]);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function runImportCase(fixture, pool) {
  console.log(`CASE_START ${fixture.id}`);
  const errors = [];
  const importResult = await fetchJson(`${baseUrl}/api/recipes/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor_email: actorEmail, ...fixture.payload })
  });

  if (!importResult.ok) {
    return { fixture, errors: [`import failed ${importResult.status} ${importResult.data?.error || ""}`.trim()], importResult };
  }

  const mode = importResult.data?.v3_preview?.mode || "";
  const importCount = Number(importResult.data?.count || 0);
  if (fixture.expect.minRecipes && importCount < fixture.expect.minRecipes) {
    errors.push(`import count too low: ${importCount}`);
  }
  if (fixture.expect.mode && mode !== fixture.expect.mode) {
    errors.push(`mode mismatch: expected=${fixture.expect.mode} actual=${mode}`);
  }

  const confirmPayload = buildUniqueConfirmPayload(importResult, fixture.id);
  const confirmResult = await fetchJson(`${baseUrl}/api/recipes/import/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(confirmPayload)
  });
  if (!confirmResult.ok) {
    errors.push(`confirm failed ${confirmResult.status} ${confirmResult.data?.error || ""}`.trim());
    return { fixture, errors, importResult, confirmResult };
  }

  const created = extractCreatedRows(confirmResult.data);
  const detailRows = [];
  for (const row of created) {
    const detail = await getRecipeDetail(row.recipe_id);
    detailRows.push({ row, detail });
    if (!detail.ok) {
      errors.push(`detail failed recipe_id=${row.recipe_id} status=${detail.status}`);
      continue;
    }
    const version = getActiveVersion(detail.data);
    const record = parseRecord(version);
    if (row.entity_kind === "ELEMENT") {
      const imported = (importResult.data?.recipes || []).find((item) => item.meta?.dish_name === detail.data?.data?.name || item.meta?.dish_name === detail.data?.name);
      if (imported) {
        const expectedSteps = Array.isArray(imported.steps) ? imported.steps.length : 0;
        const actualSteps = Array.isArray(record.steps) ? record.steps.length : 0;
        if (expectedSteps !== actualSteps) {
          errors.push(`step mismatch ${imported.meta.dish_name}: import=${expectedSteps} stored=${actualSteps}`);
        }
      }
    }
    if (row.entity_kind === "COMPOSITE") {
      const expectedAssembly = Array.isArray(importResult.data?.v3_preview?.composite?.assembly_steps)
        ? importResult.data.v3_preview.composite.assembly_steps.length
        : 0;
      const actualAssembly = Array.isArray(record.assembly_steps) ? record.assembly_steps.length : 0;
      if (expectedAssembly !== actualAssembly) {
        errors.push(`assembly step mismatch: import=${expectedAssembly} stored=${actualAssembly}`);
      }
    }
  }

  const chainTarget =
    fixture.expect.fullChain === "composite"
      ? detailRows.find((item) => item.row.entity_kind === "COMPOSITE")
      : detailRows.find((item) => item.row.entity_kind === "ELEMENT");

  let chain = null;
  if (chainTarget?.detail?.ok) {
    const version = getActiveVersion(chainTarget.detail.data);
    if (version?.id) {
      chain = await submitReviewPublish(version.id);
      if (!chain.submit.ok) errors.push(`submit failed ${chain.submit.status} ${chain.submit.data?.error || ""}`.trim());
      if (!chain.review.ok) errors.push(`review failed ${chain.review.status} ${chain.review.data?.error || ""}`.trim());
      if (!chain.publish.ok) errors.push(`publish failed ${chain.publish.status} ${chain.publish.data?.error || ""}`.trim());
    }
  }

  try {
    await cleanupRecipeIds(pool, created.map((item) => Number(item.recipe_id)).filter(Boolean));
  } catch (error) {
    errors.push(`cleanup failed ${(error && error.message) || error}`);
  }

  return {
    fixture,
    importResult,
    confirmResult,
    created,
    detailRows,
    chain,
    errors
  };
}

async function runDirectElementCase(fixture, pool) {
  console.log(`CASE_START ${fixture.id}`);
  const errors = [];
  const code = `TEST_DIRECT_${Date.now()}`;
  const create = await fetchJson(`${baseUrl}/api/recipes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      name: "Direct Element E2E",
      business_type: "BACKBONE",
      menu_cycle: "",
      yield: "1 batch",
      instructions: "Whisk all ingredients until smooth. Hold warm.",
      created_by: actorEmail,
      ingredients: [
        { name: "Butter", quantity: "120", unit: "g", note: "" },
        { name: "Cream", quantity: "240", unit: "g", note: "" }
      ]
    })
  });
  if (!create.ok) {
    return { fixture, create, errors: [`create failed ${create.status} ${create.data?.error || ""}`.trim()] };
  }
  const recipeId = create.data?.data?.id;
  const version = Array.isArray(create.data?.data?.versions) ? create.data.data.versions[0] : null;
  if (!recipeId || !version?.id) {
    errors.push("create response missing recipe/version id");
  }

  const detail = recipeId ? await getRecipeDetail(recipeId) : null;
  if (detail?.ok) {
    const active = getActiveVersion(detail.data);
    const record = parseRecord(active);
    const actualSteps = Array.isArray(record.steps) ? record.steps.length : 0;
    if (actualSteps !== 1) {
      errors.push(`direct element step mismatch expected=1 actual=${actualSteps}`);
    }
  } else {
    errors.push(`detail failed ${detail?.status || "-"}`);
  }

  let chain = null;
  if (version?.id) {
    chain = await submitReviewPublish(version.id);
    if (!chain.submit.ok) errors.push(`submit failed ${chain.submit.status} ${chain.submit.data?.error || ""}`.trim());
    if (!chain.review.ok) errors.push(`review failed ${chain.review.status} ${chain.review.data?.error || ""}`.trim());
    if (!chain.publish.ok) errors.push(`publish failed ${chain.publish.status} ${chain.publish.data?.error || ""}`.trim());
  }

  try {
    await cleanupRecipeIds(pool, recipeId ? [Number(recipeId)] : []);
  } catch (error) {
    errors.push(`cleanup failed ${(error && error.message) || error}`);
  }

  return {
    fixture,
    create,
    detail,
    chain,
    errors
  };
}

async function main() {
  const ready = await waitForBase(baseUrl);
  if (!ready) {
    console.error(`Base URL not reachable: ${baseUrl}`);
    process.exit(1);
  }

  const pool = makePool();
  const activeCases = cases.filter((item) => item.kind !== "import" || item.payload || !item.optional);
  const results = [];

  for (const fixture of activeCases) {
    if (fixture.kind === "import") {
      results.push(await runImportCase(fixture, pool));
    } else {
      results.push(await runDirectElementCase(fixture, pool));
    }
    console.log(`CASE_DONE ${fixture.id}`);
  }

  if (pool) {
    await pool.end();
  }

  const lines = [
    "# Recipe Fullchain E2E Report",
    "",
    `Base URL: ${baseUrl}`,
    `Actor: ${actorEmail}`,
    `Reviewer: ${reviewerEmail}`,
    `Generated: ${new Date().toISOString()}`,
    ""
  ];

  let hasFailure = false;
  for (const result of results) {
    const ok = result.errors.length === 0;
    if (!ok) hasFailure = true;
    lines.push(`## ${result.fixture.id}`);
    lines.push(`- label: ${result.fixture.label}`);
    lines.push(`- ok: ${ok}`);
    if (result.importResult) {
      lines.push(`- import_status: ${result.importResult.status}`);
      lines.push(`- import_count: ${result.importResult.data?.count ?? 0}`);
      lines.push(`- mode: ${result.importResult.data?.v3_preview?.mode || "-"}`);
    }
    if (result.confirmResult) {
      lines.push(`- confirm_status: ${result.confirmResult.status}`);
      lines.push(`- created_count: ${Array.isArray(result.created) ? result.created.length : 0}`);
    }
    if (result.create) {
      lines.push(`- create_status: ${result.create.status}`);
    }
    if (result.chain) {
      lines.push(`- submit_status: ${result.chain.submit.status}`);
      lines.push(`- review_status: ${result.chain.review.status}`);
      lines.push(`- publish_status: ${result.chain.publish.status}`);
    }
    if (result.errors.length > 0) {
      lines.push(`- errors: ${JSON.stringify(result.errors)}`);
    }
    lines.push("");
  }

  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`REPORT_WRITTEN ${reportPath}`);

  if (hasFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
