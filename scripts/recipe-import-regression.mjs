import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";

const baseUrl = process.env.RECIPE_IMPORT_BASE_URL || "http://localhost:3000";
const actorEmail = process.env.RECIPE_IMPORT_ACTOR || "owner@restaurant.local";
const shouldStartServer = process.env.AUTO_START_SERVER === "1";
const verifyConfirm = process.env.VERIFY_CONFIRM !== "0";
const reportPath = path.join(process.cwd(), "output", "recipe-import-regression-report.md");

const cases = [
  {
    id: "components_lobster",
    label: "Components text with long instructions",
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
        "",
        "Lobster Brine",
        "Water",
        "1000g",
        "Salt",
        "17g",
        "Instruction:",
        "Boil the water in a pot, add all things except 桂花蝉 to cook for 30 mins. Add the 桂花蝉 to infuse about 10 mins. Blend all things and strain through filter paper.",
        "",
        "Lobster Sauce",
        "Water",
        "500g",
        "Chicken stock",
        "500g",
        "Instruction:",
        "1. Fry the onion, shallots and gingers. 2. Add stock and simmer. 3. Strain the liquid.",
        "",
        "Pumpkin Puree",
        "Pumpkin",
        "500g",
        "Instruction:",
        "Roast and blend.",
        "",
        "Pear Gel",
        "Pear juice",
        "200g",
        "Agar",
        "1%",
        "Instruction:",
        "Boil then blend."
      ].join("\n")
    },
    expect: {
      count: 4,
      parseMethod: "local_deterministic",
      minMaxSteps: 3
    }
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
        "1) sweat onion",
        "2) simmer 20 mins",
        "",
        "Crunch",
        "Bread crumbs",
        "80g",
        "Instruction:",
        "toast until golden",
        "",
        "Herb Oil",
        "Basil",
        "40g",
        "Olive oil",
        "200g",
        "Method:",
        "blend and strain"
      ].join("\n")
    },
    expect: {
      count: 3,
      parseMethod: "local_deterministic",
      minMaxSteps: 2
    }
  },
  {
    id: "basic_sauce_bilingual",
    label: "Bilingual backbone text",
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
        "所有肉烤180度35分钟。加水 simmer 12小时。"
      ].join("\n")
    },
    expect: {
      count: 2
    }
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
    expect: {
      count: 2
    }
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
    expect: {
      count: 1,
      minMaxSteps: 3
    }
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
    expect: {
      count: 3,
      parseMethod: "local_deterministic"
    }
  },
  {
    id: "docx_basic_sauce",
    label: "DOCX import",
    payload: null,
    optional: true,
    expect: {
      minCount: 1
    }
  }
];

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

function maybeLoadDocxFixture() {
  const docxPath = "/Users/jeff/Downloads/basic sauce.docx";
  if (!fs.existsSync(docxPath)) return null;
  const base64 = fs.readFileSync(docxPath).toString("base64");
  return { type: "docx", content: base64 };
}

function validateCase(result, fixture) {
  const errors = [];
  const count = Number(result.data?.count || 0);
  if (fixture.expect.count !== undefined && count !== fixture.expect.count) {
    errors.push(`count expected ${fixture.expect.count} got ${count}`);
  }
  if (fixture.expect.minCount !== undefined && count < fixture.expect.minCount) {
    errors.push(`count expected >= ${fixture.expect.minCount} got ${count}`);
  }
  const parseMethod = result.data?.review?.parse_method;
  if (fixture.expect.parseMethod && parseMethod !== fixture.expect.parseMethod) {
    errors.push(`parse_method expected ${fixture.expect.parseMethod} got ${parseMethod}`);
  }
  if (fixture.expect.minMaxSteps !== undefined) {
    const maxSteps = Math.max(0, ...(result.data?.recipes || []).map((recipe) => recipe.steps?.length || 0));
    if (maxSteps < fixture.expect.minMaxSteps) {
      errors.push(`max steps expected >= ${fixture.expect.minMaxSteps} got ${maxSteps}`);
    }
  }
  return errors;
}

async function maybeConfirmImport(result, fixture) {
  if (!verifyConfirm) return { checked: false };
  if (!Array.isArray(result.data?.recipes) || result.data.recipes.length < 1) {
    return { checked: false };
  }
  const draftItems = result.data.recipes.slice(0, 2).map((recipe) => ({
    dish_name: recipe.meta.dish_name,
    dish_code: `${recipe.meta.dish_code}-REG-${Date.now()}`,
    recipe_type: recipe.meta.recipe_type,
    menu_cycle: recipe.meta.menu_cycle || (recipe.meta.recipe_type === "MENU" ? "REGRESSION" : null),
    plating_image_url: recipe.meta.plating_image_url,
    servings: recipe.production.servings,
    net_yield_rate: recipe.production.net_yield_rate,
    allergens: recipe.allergens,
    ingredients: recipe.ingredients,
    steps: recipe.steps
  }));
  const confirm = await fetchJson(`${baseUrl}/api/recipes/import/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor_email: actorEmail, draft_items: draftItems })
  });
  if (!confirm.ok) {
    return { checked: true, ok: false, error: `confirm failed ${confirm.status} ${confirm.data?.error || ""}`.trim() };
  }
  const db = new Database(path.join(process.cwd(), "data", "app.db"));
  const checked = draftItems.map((item) => {
    const row = db.prepare(`
      SELECT rv.record_json
      FROM recipes r
      JOIN recipe_versions rv ON rv.recipe_id = r.id
      WHERE r.code = ?
      ORDER BY rv.id DESC
      LIMIT 1
    `).get(item.dish_code);
    const parsed = row ? JSON.parse(row.record_json) : null;
    return {
      dish_code: item.dish_code,
      steps: parsed?.steps?.length || 0
    };
  });
  db.close();
  return { checked: true, ok: true, rows: checked };
}

async function run() {
  let serverProcess = null;
  if (shouldStartServer) {
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

  const docxFixture = maybeLoadDocxFixture();
  const activeCases = cases
    .map((item) => item.id === "docx_basic_sauce" ? { ...item, payload: docxFixture } : item)
    .filter((item) => item.payload || !item.optional);

  const report = [
    "# Recipe Import Regression Report",
    "",
    `Base URL: ${baseUrl}`,
    `Actor: ${actorEmail}`,
    `Generated: ${new Date().toISOString()}`,
    ""
  ];

  let hasFailure = false;
  for (const fixture of activeCases) {
    const result = await fetchJson(`${baseUrl}/api/recipes/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor_email: actorEmail, ...fixture.payload })
    });
    const errors = [];
    if (!result.ok) {
      errors.push(`HTTP ${result.status} ${result.data?.error || ""}`.trim());
    } else {
      errors.push(...validateCase(result, fixture));
    }
    const confirmResult = result.ok ? await maybeConfirmImport(result, fixture) : { checked: false };
    if (confirmResult.checked && !confirmResult.ok) {
      errors.push(confirmResult.error);
    }
    if (confirmResult.checked && confirmResult.ok) {
      for (const row of confirmResult.rows) {
        if (row.steps < 1) errors.push(`confirm saved 0 steps for ${row.dish_code}`);
      }
    }
    if (errors.length > 0) hasFailure = true;
    const recipeSummary = (result.data?.recipes || []).map((recipe) => ({
      name: recipe.meta?.dish_name,
      steps: recipe.steps?.length || 0,
      ingredients: recipe.ingredients?.length || 0
    }));
    report.push(`## ${fixture.id}`);
    report.push(`- label: ${fixture.label}`);
    report.push(`- ok: ${errors.length === 0}`);
    report.push(`- status: ${result.status}`);
    report.push(`- count: ${result.data?.count ?? 0}`);
    report.push(`- parse_method: ${result.data?.review?.parse_method || "-"}`);
    report.push(`- recipes: ${JSON.stringify(recipeSummary)}`);
    if (confirmResult.checked && confirmResult.ok) {
      report.push(`- confirm_steps: ${JSON.stringify(confirmResult.rows)}`);
    }
    if (errors.length > 0) {
      report.push(`- errors: ${errors.join(" | ")}`);
    }
    report.push("");
    const status = errors.length === 0 ? "PASS" : "FAIL";
    console.log(`${status} ${fixture.id} count=${result.data?.count ?? 0} parse=${result.data?.review?.parse_method || "-"}`);
    if (errors.length > 0) {
      for (const error of errors) console.log(`  ${error}`);
    }
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
