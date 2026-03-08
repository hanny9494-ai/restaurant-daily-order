import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";

const baseUrl = process.env.RECIPE_IMPORT_BASE_URL || "http://localhost:3000";
const actorEmail = process.env.RECIPE_IMPORT_ACTOR || "owner@restaurant.local";
const autoStartServer = process.env.AUTO_START_SERVER !== "0";
const reportPath = path.join(process.cwd(), "output", "recipe-v3-import-check-report.md");

const cases = [
  {
    id: "components_lobster_text",
    label: "Components text / lobster",
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
    },
    expectMinCount: 5
  },
  {
    id: "nonstandard_bullets",
    label: "Non-standard bullet components",
    payload: {
      type: "text",
      content: [
        "Chef Special",
        "",
        "Components：",
        "• Sauce Base",
        "• Crunch",
        "• Herb Oil",
        "",
        "Sauce Base",
        "Tomato",
        "300g",
        "Onion",
        "100g",
        "Instructions:",
        "1) Sweat onion. 2) Add tomato. 3) Simmer 20 mins.",
        "",
        "Crunch",
        "Bread crumbs",
        "80g",
        "Instruction:",
        "Toast until golden.",
        "",
        "Herb Oil",
        "Basil",
        "40g",
        "Olive oil",
        "200g",
        "Method:",
        "Blanch herbs. Blend with oil. Strain."
      ].join("\n")
    },
    expectMinCount: 3
  },
  {
    id: "basic_sauce_text",
    label: "Basic sauce bilingual text",
    payload: {
      type: "text",
      content: [
        "BASIC SAUCE",
        "",
        "Beef Jus",
        "Beef spine 10kg",
        "Chicken frame 5kg",
        "Onion 1.5kg",
        "Instruction:",
        "牛骨鸡骨烤220度18分钟。加水 simmer 12小时。过滤。",
        "",
        "Chicken Stock",
        "Chicken wings 9kg",
        "Chicken feet 6kg",
        "Onion 6ea",
        "Instruction:",
        "所有肉烤180度35分钟。加水 simmer 12小时。",
        "",
        "Chinese Chicken Stock",
        "老母鸡 2只",
        "鸡爪 2斤",
        "Instruction:",
        "飞水后 simmer 一整晚，第二天再煮 4 小时。"
      ].join("\n")
    },
    expectMinCount: 3
  },
  {
    id: "csv_components",
    label: "CSV import",
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
    },
    expectMinCount: 2
  },
  {
    id: "markdown_table",
    label: "Markdown table recipe",
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
    },
    expectMinCount: 1
  },
  {
    id: "mixed_component_titles",
    label: "Mixed bilingual components",
    payload: {
      type: "text",
      content: [
        "Duck",
        "",
        "Components:",
        "- Duck Jus",
        "- 绿油 Green Oil",
        "- Crispy Skin",
        "",
        "Duck Jus",
        "Duck leg",
        "4pcs",
        "Instruction:",
        "Roast duck bones. Add stock. Reduce by half.",
        "",
        "绿油 Green Oil",
        "Herbs",
        "100g",
        "Oil",
        "300g",
        "Instruction:",
        "Blanch herbs. Blend with oil. Strain.",
        "",
        "Crispy Skin",
        "Duck skin",
        "500g",
        "Instruction:",
        "Dry overnight. Bake until crisp."
      ].join("\n")
    },
    expectMinCount: 3
  },
  {
    id: "cookbook_composite",
    label: "Cookbook composite / caviar",
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
    },
    expectMinCount: 2
  },
  {
    id: "docx_lobster",
    label: "DOCX lobster",
    payload: maybeLoadDocx("/Users/jeff/Downloads/Lobster.docx", "docx"),
    optional: true,
    expectMinCount: 4
  },
  {
    id: "docx_basic_sauce",
    label: "DOCX basic sauce",
    payload: maybeLoadDocx("/Users/jeff/Downloads/basic sauce.docx", "docx"),
    optional: true,
    expectMinCount: 2
  },
  {
    id: "docx_crab",
    label: "DOCX crab",
    payload: maybeLoadDocx("/Users/jeff/Downloads/Crab.docx", "docx"),
    optional: true,
    expectMinCount: 1
  }
];

function maybeLoadDocx(filePath, type) {
  if (!fs.existsSync(filePath)) return null;
  return {
    type,
    content: fs.readFileSync(filePath).toString("base64")
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function waitForServer(url) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${url}/`);
      if (res.ok) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildUniqueConfirmPayload(importResult, caseId) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const suffix = `_CHK_${caseId.toUpperCase()}_${stamp}`;
  const recipes = Array.isArray(importResult.data?.recipes) ? clone(importResult.data.recipes) : [];
  const v3Preview = importResult.data?.v3_preview ? clone(importResult.data.v3_preview) : null;

  const codeMap = new Map();
  recipes.forEach((recipe) => {
    const original = String(recipe.meta.dish_code || "AUTO");
    const next = `${original}${suffix}`.slice(0, 120);
    recipe.meta.dish_code = next;
    codeMap.set(original, next);
  });

  const draftItems = recipes.map((recipe) => ({
    dish_name: recipe.meta.dish_name,
    dish_code: recipe.meta.dish_code,
    recipe_type: recipe.meta.recipe_type,
    menu_cycle: recipe.meta.menu_cycle || (recipe.meta.recipe_type === "MENU" ? "REGRESSION" : null),
    plating_image_url: recipe.meta.plating_image_url,
    servings: recipe.production.servings,
    net_yield_rate: recipe.production.net_yield_rate,
    allergens: recipe.allergens,
    diet_flags: recipe.diet_flags || [],
    ingredients: recipe.ingredients,
    steps: recipe.steps
  }));

  if (v3Preview?.elements) {
    v3Preview.elements = v3Preview.elements.map((item) => ({
      ...item,
      dish_code: codeMap.get(String(item.dish_code)) || `${String(item.dish_code)}${suffix}`
    }));
  }
  if (v3Preview?.composite) {
    const originalCompositeCode = String(v3Preview.composite.dish_code || "AUTO_COMPOSITE");
    v3Preview.composite.dish_code = `${originalCompositeCode}${suffix}`.slice(0, 120);
    v3Preview.composite.assembly_components = Array.isArray(v3Preview.composite.assembly_components)
      ? v3Preview.composite.assembly_components.map((component) => ({
          ...component,
          child_code: component.child_code ? (codeMap.get(String(component.child_code)) || `${String(component.child_code)}${suffix}`) : component.child_code
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

function openDb() {
  return new Database(path.join(process.cwd(), "data", "app.db"));
}

function readPersistedState(db, createdRows) {
  return createdRows.map((item) => {
    const recipe = db.prepare(`
      SELECT id, code, name, entity_kind, business_type, technique_family, active_version_id
      FROM recipes
      WHERE id = ?
      LIMIT 1
    `).get(item.recipe_id);
    const version = db.prepare(`
      SELECT id, version_no, status, record_json
      FROM recipe_versions
      WHERE id = ?
      LIMIT 1
    `).get(item.version_id);
    const ingredients = db.prepare(`
      SELECT name, quantity, unit, note
      FROM recipe_ingredients
      WHERE recipe_version_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(item.version_id);
    const components = db.prepare(`
      SELECT component_kind, display_name, component_role, section, quantity, unit, child_recipe_id, child_version_id, source_ref
      FROM recipe_version_components
      WHERE parent_version_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(item.version_id);
    let parsed = null;
    try {
      parsed = version?.record_json ? JSON.parse(version.record_json) : null;
    } catch {}
    return {
      recipe,
      version,
      ingredients,
      components,
      parsed
    };
  });
}

function validatePersistedState(importResult, persistedRows) {
  const errors = [];
  const importedRecipes = Array.isArray(importResult.data?.recipes) ? importResult.data.recipes : [];
  const preview = importResult.data?.v3_preview || null;

  for (const imported of importedRecipes) {
    const row = persistedRows.find((item) => item.recipe?.name === imported.meta.dish_name && item.recipe?.entity_kind === "ELEMENT");
    if (!row) {
      errors.push(`missing persisted element ${imported.meta.dish_name}`);
      continue;
    }
    const storedSteps = Array.isArray(row.parsed?.steps) ? row.parsed.steps.length : 0;
    const importedSteps = Array.isArray(imported.steps) ? imported.steps.length : 0;
    if (storedSteps !== importedSteps) {
      errors.push(`step mismatch ${imported.meta.dish_name}: import=${importedSteps} stored=${storedSteps}`);
    }
    const storedIngredients = Array.isArray(row.parsed?.ingredients) ? row.parsed.ingredients.length : row.ingredients.length;
    const importedIngredients = Array.isArray(imported.ingredients) ? imported.ingredients.length : 0;
    if (storedIngredients !== importedIngredients) {
      errors.push(`ingredient mismatch ${imported.meta.dish_name}: import=${importedIngredients} stored=${storedIngredients}`);
    }
  }

  if (preview?.mode === "COMPOSITE" && preview?.composite) {
    const compositeRow = persistedRows.find((item) => item.recipe?.entity_kind === "COMPOSITE");
    if (!compositeRow) {
      errors.push("missing persisted composite");
    } else {
      const importedAssemblySteps = Array.isArray(preview.composite.assembly_steps) ? preview.composite.assembly_steps.length : 0;
      const storedAssemblySteps = Array.isArray(compositeRow.parsed?.assembly_steps) ? compositeRow.parsed.assembly_steps.length : 0;
      if (importedAssemblySteps !== storedAssemblySteps) {
        errors.push(`composite assembly steps mismatch: import=${importedAssemblySteps} stored=${storedAssemblySteps}`);
      }
      const expectedLinks =
        (Array.isArray(preview.composite.assembly_components) ? preview.composite.assembly_components.length : 0) +
        (Array.isArray(preview.unresolved_refs) ? preview.unresolved_refs.length : 0) +
        (Array.isArray(preview.finish_items) ? preview.finish_items.length : 0);
      if ((compositeRow.components || []).length !== expectedLinks) {
        errors.push(`composite link count mismatch: expected=${expectedLinks} stored=${(compositeRow.components || []).length}`);
      }
    }
  }

  return errors;
}

function cleanupCreatedRows(db, createdRows) {
  const recipeIds = createdRows.map((row) => Number(row.recipe_id)).filter(Boolean);
  const versionIds = createdRows.map((row) => Number(row.version_id)).filter(Boolean);
  if (recipeIds.length < 1 && versionIds.length < 1) return;
  const tx = db.transaction(() => {
    if (versionIds.length > 0) {
      db.prepare(`DELETE FROM recipe_version_components WHERE parent_version_id IN (${versionIds.map(() => "?").join(",")})`).run(...versionIds);
      db.prepare(`DELETE FROM recipe_ingredients WHERE recipe_version_id IN (${versionIds.map(() => "?").join(",")})`).run(...versionIds);
    }
    if (recipeIds.length > 0) {
      db.prepare(`UPDATE recipes SET active_version_id = NULL WHERE id IN (${recipeIds.map(() => "?").join(",")})`).run(...recipeIds);
      db.prepare(`DELETE FROM recipe_versions WHERE recipe_id IN (${recipeIds.map(() => "?").join(",")})`).run(...recipeIds);
      db.prepare(`DELETE FROM recipes WHERE id IN (${recipeIds.map(() => "?").join(",")})`).run(...recipeIds);
    }
  });
  tx();
}

async function runCase(fixture) {
  const importResult = await fetchJson(`${baseUrl}/api/recipes/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor_email: actorEmail, ...fixture.payload })
  });
  const errors = [];
  if (!importResult.ok) {
    return {
      fixture,
      importResult,
      errors: [`import failed ${importResult.status} ${importResult.data?.error || ""}`.trim()],
      created: []
    };
  }

  const importCount = Number(importResult.data?.count || 0);
  if (importCount < fixture.expectMinCount) {
    errors.push(`import count expected >= ${fixture.expectMinCount} got ${importCount}`);
  }

  const confirmPayload = buildUniqueConfirmPayload(importResult, fixture.id);
  const confirmResult = await fetchJson(`${baseUrl}/api/recipes/import/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(confirmPayload)
  });
  if (!confirmResult.ok) {
    errors.push(`confirm failed ${confirmResult.status} ${confirmResult.data?.error || ""}`.trim());
    return {
      fixture,
      importResult,
      confirmResult,
      errors,
      created: []
    };
  }

  const created = Array.isArray(confirmResult.data?.created) ? confirmResult.data.created : [];
  const db = openDb();
  const persisted = readPersistedState(db, created);
  errors.push(...validatePersistedState(importResult, persisted));
  cleanupCreatedRows(db, created);
  db.close();

  return {
    fixture,
    importResult,
    confirmResult,
    persisted,
    errors,
    created
  };
}

async function run() {
  let serverProcess = null;
  if (autoStartServer) {
    serverProcess = spawn("npm", ["run", "dev"], {
      cwd: process.cwd(),
      stdio: "ignore",
      shell: process.platform === "win32"
    });
  }

  const ready = await waitForServer(baseUrl);
  if (!ready) {
    console.error(`Server not reachable at ${baseUrl}`);
    process.exitCode = 1;
    return;
  }

  const activeCases = cases.filter((item) => item.payload || !item.optional);
  const report = [
    "# Recipe V3 Import Check Report",
    "",
    `Base URL: ${baseUrl}`,
    `Actor: ${actorEmail}`,
    `Generated: ${new Date().toISOString()}`,
    ""
  ];

  let hasFailure = false;
  for (const fixture of activeCases) {
    const result = await runCase(fixture);
    if (result.errors.length > 0) hasFailure = true;
    const importedRecipes = (result.importResult.data?.recipes || []).map((item) => ({
      name: item.meta?.dish_name,
      ingredients: item.ingredients?.length || 0,
      steps: item.steps?.length || 0
    }));
    const persistedSummary = (result.persisted || []).map((item) => ({
      name: item.recipe?.name,
      entity_kind: item.recipe?.entity_kind,
      ingredients: item.ingredients?.length || 0,
      steps: Array.isArray(item.parsed?.steps) ? item.parsed.steps.length : Array.isArray(item.parsed?.assembly_steps) ? item.parsed.assembly_steps.length : 0,
      links: item.components?.length || 0
    }));
    report.push(`## ${fixture.id}`);
    report.push(`- label: ${fixture.label}`);
    report.push(`- ok: ${result.errors.length === 0}`);
    report.push(`- import_status: ${result.importResult.status}`);
    report.push(`- confirm_status: ${result.confirmResult?.status || "-"}`);
    report.push(`- import_count: ${result.importResult.data?.count ?? 0}`);
    report.push(`- mode: ${result.importResult.data?.v3_preview?.mode || "-"}`);
    report.push(`- parse_method: ${result.importResult.data?.review?.parse_method || "-"}`);
    report.push(`- imported: ${JSON.stringify(importedRecipes)}`);
    report.push(`- persisted: ${JSON.stringify(persistedSummary)}`);
    if (result.errors.length > 0) {
      report.push(`- errors: ${result.errors.join(" | ")}`);
    }
    report.push("");
    const status = result.errors.length === 0 ? "PASS" : "FAIL";
    console.log(`${status} ${fixture.id} import=${result.importResult.data?.count ?? 0} mode=${result.importResult.data?.v3_preview?.mode || "-"}`);
    for (const error of result.errors) console.log(`  ${error}`);
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${report.join("\n")}\n`);
  console.log(`Report written to ${reportPath}`);

  if (serverProcess) {
    serverProcess.kill("SIGINT");
  }
  if (hasFailure) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
