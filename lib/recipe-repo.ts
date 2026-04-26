import {
  createCompositeRecipeWithDraft as createCompositeRecipeWithDraftSqlite,
  createImportedRecipeDrafts as createImportedRecipeDraftsSqlite,
  createRecipeRevision as createRecipeRevisionSqlite,
  confirmSmartEdit as confirmSmartEditSqlite,
  getRecipeDetail as getRecipeDetailSqlite,
  createRecipeWithDraft as createRecipeWithDraftSqlite,
  listApprovedRecipeVersions as listApprovedRecipeVersionsSqlite,
  listPendingRecipeVersions as listPendingRecipeVersionsSqlite,
  listRecipes as listRecipesSqlite,
  logRecipeSync as logRecipeSyncSqlite,
  publishRecipeVersion as publishRecipeVersionSqlite,
  reviewRecipeVersion as reviewRecipeVersionSqlite,
  submitRecipeForReview as submitRecipeForReviewSqlite,
  updateRecipeBase as updateRecipeBaseSqlite,
  deleteRecipe as deleteRecipeSqlite,
  updateRecipeDraft as updateRecipeDraftSqlite
} from "@/lib/db";
import { getPostgresPool, hasPostgresConnection } from "@/lib/postgres";
import type { RecipeDetail, RecipeIngredient, RecipeSummary, RecipeVersion, RecipeVersionComponent } from "@/lib/types";

function usePostgresRecipeStore() {
  return String(process.env.RECIPES_DB_PROVIDER || "").trim().toLowerCase() === "postgres" && hasPostgresConnection();
}

function mapRecipeSummaryRow(row: any): RecipeSummary {
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    description: row.description ?? null,
    entity_kind: row.entity_kind === "COMPOSITE" ? "COMPOSITE" : "ELEMENT",
    business_type: row.business_type === "MENU" ? "MENU" : "BACKBONE",
    technique_family: row.technique_family ?? null,
    recipe_type: row.business_type === "MENU" ? "MENU" : "BACKBONE",
    menu_cycle: row.menu_cycle ?? null,
    active_version_id: row.active_version_id !== null ? Number(row.active_version_id) : null,
    active_version_no: row.active_version_no !== null ? Number(row.active_version_no) : null,
    active_status: row.active_status ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function mapIngredientRow(row: any): RecipeIngredient {
  return {
    id: Number(row.id),
    recipe_version_id: Number(row.recipe_version_id),
    name: String(row.name),
    quantity: String(row.quantity),
    unit: String(row.unit),
    note: row.note ?? null,
    sort_order: Number(row.sort_order)
  };
}

function mapComponentRow(row: any): RecipeVersionComponent {
  return {
    id: Number(row.id),
    parent_version_id: Number(row.parent_version_id),
    component_kind: row.component_kind,
    child_recipe_id: row.child_recipe_id !== null ? Number(row.child_recipe_id) : null,
    child_version_id: row.child_version_id !== null ? Number(row.child_version_id) : null,
    display_name: String(row.display_name),
    component_role: row.component_role ?? null,
    section: String(row.section),
    quantity: row.quantity ?? null,
    unit: row.unit ?? null,
    sort_order: Number(row.sort_order),
    is_optional: row.is_optional ? 1 : 0,
    source_ref: row.source_ref ?? null,
    prep_note: row.prep_note ?? null
  };
}

function mapVersionRow(row: any): RecipeVersion {
  return {
    id: Number(row.id),
    recipe_id: Number(row.recipe_id),
    version_no: Number(row.version_no),
    status: row.status,
    yield: row.yield ?? null,
    servings: row.yield ?? null,
    instructions: String(row.instructions || ""),
    change_note: row.change_note ?? null,
    recipe_record_json: row.recipe_record_json ? JSON.stringify(row.recipe_record_json) : null,
    created_by: String(row.created_by),
    submitted_at: row.submitted_at ?? null,
    approved_at: row.approved_at ?? null,
    reviewed_by: row.reviewed_by ?? null,
    review_note: row.review_note ?? null,
    published_at: row.published_at ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    ingredients: [],
    components: []
  };
}

export async function listRecipesRepo(): Promise<RecipeSummary[]> {
  if (!usePostgresRecipeStore()) return listRecipesSqlite();
  const pool = getPostgresPool();
  const result = await pool.query(`
    SELECT
      r.id,
      r.code,
      r.name,
      r.description,
      r.entity_kind,
      r.business_type,
      r.technique_family,
      r.menu_cycle,
      r.active_version_id,
      rv.version_no AS active_version_no,
      rv.status AS active_status,
      r.created_at,
      r.updated_at
    FROM recipes r
    LEFT JOIN recipe_versions rv ON rv.id = r.active_version_id
    ORDER BY r.updated_at DESC, r.id DESC
  `);
  return result.rows.map(mapRecipeSummaryRow);
}

export async function getRecipeDetailRepo(recipeId: number): Promise<RecipeDetail | null> {
  if (!usePostgresRecipeStore()) return getRecipeDetailSqlite(recipeId);
  const pool = getPostgresPool();
  const recipeResult = await pool.query(`
    SELECT
      r.id,
      r.code,
      r.name,
      r.description,
      r.entity_kind,
      r.business_type,
      r.technique_family,
      r.menu_cycle,
      r.active_version_id,
      rv.version_no AS active_version_no,
      rv.status AS active_status,
      r.created_at,
      r.updated_at
    FROM recipes r
    LEFT JOIN recipe_versions rv ON rv.id = r.active_version_id
    WHERE r.id = $1
    LIMIT 1
  `, [recipeId]);
  const recipeRow = recipeResult.rows[0];
  if (!recipeRow) return null;
  const summary = mapRecipeSummaryRow(recipeRow);

  const versionsResult = await pool.query(`
    SELECT
      id,
      recipe_id,
      version_no,
      status,
      servings AS yield,
      instructions,
      record_json AS recipe_record_json,
      change_note,
      created_by,
      submitted_at,
      approved_at,
      reviewed_by,
      review_note,
      published_at,
      created_at,
      updated_at
    FROM recipe_versions
    WHERE recipe_id = $1
    ORDER BY version_no DESC
  `, [recipeId]);
  const versionRows = versionsResult.rows;
  const versionIds = versionRows.map((row) => Number(row.id));

  const ingredientsByVersion = new Map<number, RecipeIngredient[]>();
  const componentsByVersion = new Map<number, RecipeVersionComponent[]>();

  if (versionIds.length > 0) {
    const ingredientResult = await pool.query(`
      SELECT
        id,
        recipe_version_id,
        name,
        quantity,
        unit,
        note,
        sort_order
      FROM recipe_ingredients
      WHERE recipe_version_id = ANY($1::bigint[])
      ORDER BY recipe_version_id ASC, sort_order ASC, id ASC
    `, [versionIds]);
    for (const row of ingredientResult.rows) {
      const key = Number(row.recipe_version_id);
      const group = ingredientsByVersion.get(key) || [];
      group.push(mapIngredientRow(row));
      ingredientsByVersion.set(key, group);
    }

    const componentResult = await pool.query(`
      SELECT
        id,
        parent_version_id,
        component_kind,
        child_recipe_id,
        child_version_id,
        display_name,
        component_role,
        section,
        quantity,
        unit,
        sort_order,
        is_optional,
        source_ref,
        prep_note
      FROM recipe_version_components
      WHERE parent_version_id = ANY($1::bigint[])
      ORDER BY parent_version_id ASC, sort_order ASC, id ASC
    `, [versionIds]);
    for (const row of componentResult.rows) {
      const key = Number(row.parent_version_id);
      const group = componentsByVersion.get(key) || [];
      group.push(mapComponentRow(row));
      componentsByVersion.set(key, group);
    }
  }

  return {
    ...summary,
    versions: versionRows.map((row) => {
      const version = mapVersionRow(row);
      version.ingredients = ingredientsByVersion.get(version.id) || [];
      version.components = componentsByVersion.get(version.id) || [];
      return version;
    })
  };
}

async function listRecipeVersionsByStatusRepo(status: "PENDING_REVIEW" | "APPROVED") {
  if (!usePostgresRecipeStore()) {
    return status === "PENDING_REVIEW"
      ? listPendingRecipeVersionsSqlite()
      : listApprovedRecipeVersionsSqlite();
  }
  const pool = getPostgresPool();
  const selectApproved = status === "APPROVED"
    ? ", rv.approved_at"
    : "";
  const orderBy = status === "APPROVED"
    ? "rv.approved_at ASC NULLS LAST, rv.id ASC"
    : "rv.submitted_at ASC NULLS LAST, rv.id ASC";
  const result = await pool.query(`
    SELECT
      rv.id,
      rv.recipe_id,
      r.code,
      r.name,
      r.entity_kind,
      r.business_type,
      r.technique_family,
      r.menu_cycle,
      rv.version_no,
      rv.status,
      rv.created_by,
      rv.change_note,
      rv.submitted_at,
      rv.created_at
      ${selectApproved}
    FROM recipe_versions rv
    JOIN recipes r ON r.id = rv.recipe_id
    WHERE rv.status = $1
    ORDER BY ${orderBy}
  `, [status]);
  return result.rows.map((row) => ({
    id: Number(row.id),
    recipe_id: Number(row.recipe_id),
    code: String(row.code),
    name: String(row.name),
    entity_kind: row.entity_kind === "COMPOSITE" ? "COMPOSITE" : "ELEMENT",
    business_type: row.business_type === "MENU" ? "MENU" : "BACKBONE",
    technique_family: row.technique_family ?? null,
    recipe_type: row.business_type === "MENU" ? "MENU" : "BACKBONE",
    menu_cycle: row.menu_cycle ?? null,
    version_no: Number(row.version_no),
    status: String(row.status),
    created_by: String(row.created_by),
    change_note: row.change_note ?? null,
    submitted_at: row.submitted_at ?? null,
    approved_at: row.approved_at ?? null,
    created_at: String(row.created_at)
  }));
}

export async function listPendingRecipeVersionsRepo() {
  return listRecipeVersionsByStatusRepo("PENDING_REVIEW");
}

export async function listApprovedRecipeVersionsRepo() {
  return listRecipeVersionsByStatusRepo("APPROVED");
}

type RecipeRole = "OWNER" | "EDITOR" | "REVIEWER" | "VIEWER" | "FOH" | "RECEIVER";

function normalizeRecipeCode(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function normalizeMenuCycle(value?: string | null) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

async function getRecipeUserByEmailPostgres(email: string) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) throw new Error("ACTOR_REQUIRED");
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT id, name, email, role, is_active FROM recipe_users WHERE email = $1 LIMIT 1`,
    [cleanEmail]
  );
  const user = result.rows[0];
  if (!user || user.is_active !== true) throw new Error("USER_NOT_FOUND");
  return user as { id: number; name: string; email: string; role: RecipeRole; is_active: boolean };
}

async function ensureRecipeRolePostgres(email: string, allowedRoles: RecipeRole[]) {
  const user = await getRecipeUserByEmailPostgres(email);
  if (!allowedRoles.includes(user.role)) throw new Error("PERMISSION_DENIED");
  return user;
}

async function ensureUniqueRecipeCodePostgres(seed: string) {
  const pool = getPostgresPool();
  let candidate = normalizeRecipeCode(seed);
  if (!candidate) candidate = `AUTO_${Date.now()}`;
  let suffix = 1;
  while (true) {
    const result = await pool.query(`SELECT id FROM recipes WHERE code = $1 LIMIT 1`, [candidate]);
    if (result.rowCount === 0) return candidate;
    suffix += 1;
    candidate = `${normalizeRecipeCode(seed)}_${suffix}`;
  }
}

function buildDefaultElementRecord(input: {
  code: string;
  name: string;
  business_type: "MENU" | "BACKBONE";
  menu_cycle?: string | null;
  yield?: string | null;
  ingredients: Array<{ name: string; quantity: string; unit: string; note?: string }>;
  instructions: string;
}) {
  const lines = String(input.instructions || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    meta: {
      dish_code: input.code,
      dish_name: input.name,
      display_name: input.name,
      aliases: [],
      entity_kind: "ELEMENT",
      business_type: input.business_type,
      technique_family: "OTHER",
      menu_cycle: input.business_type === "MENU" ? normalizeMenuCycle(input.menu_cycle) : null,
      plating_image_url: ""
    },
    production: {
      yield: String(input.yield || ""),
      net_yield_rate: 1,
      key_temperature_points: []
    },
    allergens: [],
    diet_flags: [],
    ingredients: input.ingredients.map((item) => ({
      name: String(item.name || "").trim(),
      quantity: String(item.quantity || "").trim(),
      unit: String(item.unit || "").trim(),
      note: String(item.note || "").trim()
    })),
    steps: lines.length > 0
      ? lines.map((line, index) => ({
          step_id: `step_${String(index + 1).padStart(3, "0")}`,
          step_no: index + 1,
          action: line.replace(/^\d+[\.\)]\s*/, ""),
          time_sec: 0
        }))
      : [{ step_id: "step_001", step_no: 1, action: "待填写", time_sec: 0 }],
    component_refs: []
  };
}

async function getNextRecipeVersionNoPostgres(recipeId: number) {
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version FROM recipe_versions WHERE recipe_id = $1`,
    [recipeId]
  );
  return Number(result.rows[0]?.next_version || 1);
}

async function insertIngredientsPostgres(client: any, versionId: number, ingredients: Array<{ name: string; quantity: string; unit: string; note?: string | null }>) {
  for (let index = 0; index < ingredients.length; index += 1) {
    const item = ingredients[index];
    const name = String(item.name || "").trim();
    const quantity = String(item.quantity || "").trim();
    const unit = String(item.unit || "").trim();
    if (!name || !quantity || !unit) throw new Error("INVALID_INGREDIENT_FIELDS");
    await client.query(
      `INSERT INTO recipe_ingredients(recipe_version_id, name, quantity, unit, note, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [versionId, name, quantity, unit, item.note ? String(item.note).trim() : null, index + 1]
    );
  }
}

async function insertComponentsPostgres(client: any, versionId: number, components: any[]) {
  for (let index = 0; index < components.length; index += 1) {
    const item = components[index];
    await client.query(
      `INSERT INTO recipe_version_components(
        parent_version_id, component_kind, child_recipe_id, child_version_id, display_name,
        component_role, section, quantity, unit, sort_order, is_optional, source_ref, prep_note
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        versionId,
        String(item.component_kind || "REFERENCE_PREP"),
        item.child_recipe_id ?? null,
        item.child_version_id ?? null,
        String(item.display_name || item.ref_name || `component-${index + 1}`),
        item.component_role ? String(item.component_role) : null,
        String(item.section || "ASSEMBLY"),
        item.quantity ? String(item.quantity) : null,
        item.unit ? String(item.unit) : null,
        Number(item.sort_order || index + 1),
        Boolean(item.is_optional),
        item.source_ref ? String(item.source_ref) : null,
        item.prep_note ? String(item.prep_note) : null
      ]
    );
  }
}

async function findRecipeByCodePostgres(code: string) {
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT id, code, name, active_version_id FROM recipes WHERE code = $1 LIMIT 1`,
    [String(code || "").trim()]
  );
  const row = result.rows[0];
  return row
    ? {
        id: Number(row.id),
        code: String(row.code),
        name: String(row.name),
        active_version_id: row.active_version_id !== null ? Number(row.active_version_id) : null
      }
    : null;
}

async function getRecipeVersionRepo(versionId: number) {
  const detailList = await listRecipesRepo();
  void detailList;
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT
      id, recipe_id, version_no, status, servings AS yield, servings,
      instructions, record_json AS recipe_record_json, change_note, created_by,
      submitted_at, approved_at, reviewed_by, review_note, published_at, created_at, updated_at
     FROM recipe_versions
     WHERE id = $1
     LIMIT 1`,
    [versionId]
  );
  const row = result.rows[0];
  return row ? mapVersionRow(row) : null;
}

async function getRecipeIngredientsRepo(versionId: number) {
  if (!usePostgresRecipeStore()) return [];
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT id, recipe_version_id, name, quantity, unit, note, sort_order
     FROM recipe_ingredients
     WHERE recipe_version_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [versionId]
  );
  return result.rows.map(mapIngredientRow);
}

async function getRecipeComponentsRepo(versionId: number) {
  if (!usePostgresRecipeStore()) return [];
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT
      id, parent_version_id, component_kind, child_recipe_id, child_version_id, display_name,
      component_role, section, quantity, unit, sort_order, is_optional, source_ref, prep_note
     FROM recipe_version_components
     WHERE parent_version_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [versionId]
  );
  return result.rows.map(mapComponentRow);
}

export async function createRecipeWithDraftRepo(input: Parameters<typeof createRecipeWithDraftSqlite>[0]) {
  if (!usePostgresRecipeStore()) return createRecipeWithDraftSqlite(input);
  const actor = await ensureRecipeRolePostgres(input.created_by, ["OWNER", "EDITOR"]);
  const code = await ensureUniqueRecipeCodePostgres(input.code || input.name);
  const name = String(input.name || "").trim();
  const businessType = input.business_type === "MENU" || input.recipe_type === "MENU" ? "MENU" : "BACKBONE";
  const menuCycle = businessType === "MENU" ? normalizeMenuCycle(input.menu_cycle) : null;
  const rawInstructions = String(input.instructions || "").trim();
  const yieldValue = String(input.yield || input.servings || "").trim();
  if (!code || !name) throw new Error("INVALID_RECIPE_FIELDS");
  if (businessType === "MENU" && !menuCycle) throw new Error("MENU_CYCLE_REQUIRED");
  if (!Array.isArray(input.ingredients) || input.ingredients.length < 1) throw new Error("INGREDIENTS_REQUIRED");

  const record = buildDefaultElementRecord({
    code,
    name,
    business_type: businessType,
    menu_cycle: menuCycle,
    yield: yieldValue,
    ingredients: input.ingredients,
    instructions: rawInstructions
  });
  const instructions = rawInstructions || record.steps
    .slice()
    .sort((a, b) => Number(a.step_no || 0) - Number(b.step_no || 0))
    .map((step) => `${Number(step.step_no || 0)}. ${String(step.action || "").trim()}`)
    .filter(Boolean)
    .join("\n");

  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const recipeRes = await client.query(
      `INSERT INTO recipes(code, name, description, entity_kind, business_type, technique_family, recipe_type, menu_cycle, created_by, updated_at)
       VALUES ($1,$2,$3,'ELEMENT',$4,NULL,$5,$6,$7,NOW())
       RETURNING id`,
      [code, name, input.description?.trim() || null, businessType, businessType, menuCycle, actor.email]
    );
    const recipeId = Number(recipeRes.rows[0].id);
    const versionRes = await client.query(
      `INSERT INTO recipe_versions(
        recipe_id, version_no, status, servings, instructions, record_json, change_note, created_by, updated_at
      ) VALUES ($1,1,'DRAFT',$2,$3,$4::jsonb,$5,$6,NOW())
      RETURNING id`,
      [recipeId, yieldValue || null, instructions, JSON.stringify(record), input.change_note?.trim() || null, actor.email]
    );
    const versionId = Number(versionRes.rows[0].id);
    await insertIngredientsPostgres(client, versionId, input.ingredients);
    await client.query(`UPDATE recipes SET active_version_id = $1, updated_at = NOW() WHERE id = $2`, [versionId, recipeId]);
    await client.query("COMMIT");
    return await getRecipeDetailRepo(recipeId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type CreateCompositeRecipeInput = {
  code: string;
  name: string;
  description?: string;
  menu_cycle?: string;
  change_note?: string;
  created_by: string;
  assembly_components: Array<{
    component_kind?: "RECIPE_REF" | "REFERENCE_PREP" | "RAW_ITEM" | "FINISH_ITEM";
    child_code?: string;
    ref_name: string;
    component_role?: string;
    section?: "PREP" | "INTERMEDIATE" | "ASSEMBLY" | "FINISH" | "PLATING" | string;
    quantity?: string;
    unit?: string;
    is_optional?: boolean;
    source_ref?: string;
    prep_note?: string;
  }>;
  assembly_steps?: Array<{
    step_id?: string;
    step_no?: number;
    action: string;
  }>;
};

export async function createCompositeRecipeWithDraftRepo(input: CreateCompositeRecipeInput) {
  if (!usePostgresRecipeStore()) return createCompositeRecipeWithDraftSqlite(input);
  const actor = await ensureRecipeRolePostgres(input.created_by, ["OWNER", "EDITOR"]);
  const name = String(input.name || "").trim();
  const menuCycle = normalizeMenuCycle(input.menu_cycle);
  if (!name) throw new Error("INVALID_RECIPE_FIELDS");
  if (!menuCycle) throw new Error("MENU_CYCLE_REQUIRED");
  if (!Array.isArray(input.assembly_components) || input.assembly_components.length < 1) {
    throw new Error("ASSEMBLY_COMPONENTS_REQUIRED");
  }

  const code = await ensureUniqueRecipeCodePostgres(input.code || input.name);
  const assemblySteps = Array.isArray(input.assembly_steps) && input.assembly_steps.length > 0
    ? input.assembly_steps
        .map((step, idx) => ({
          step_id: String(step.step_id || `assembly_${String(idx + 1).padStart(3, "0")}`),
          step_no: Number(step.step_no || idx + 1),
          action: String(step.action || "").trim()
        }))
        .filter((step) => step.action)
    : [{ step_id: "assembly_001", step_no: 1, action: "按出品顺序组合各 element 并完成最终装盘。" }];

  const normalizedComponents = input.assembly_components.map((component, idx) => ({
    component_kind: String(component.component_kind || "RECIPE_REF"),
    child_code: component.child_code ? String(component.child_code).trim() : undefined,
    ref_name: String(component.ref_name || component.child_code || `component-${idx + 1}`).trim(),
    component_role: component.component_role ? String(component.component_role).trim() : undefined,
    section: String(component.section || "ASSEMBLY"),
    sort_order: idx + 1,
    quantity: component.quantity ? String(component.quantity).trim() : undefined,
    unit: component.unit ? String(component.unit).trim() : undefined,
    is_optional: Boolean(component.is_optional),
    source_ref: component.source_ref ? String(component.source_ref).trim() : undefined,
    prep_note: component.prep_note ? String(component.prep_note).trim() : undefined
  })).filter((component) => component.ref_name);

  if (normalizedComponents.length < 1) throw new Error("ASSEMBLY_COMPONENTS_REQUIRED");

  const compositeRecord = {
    meta: {
      dish_code: code,
      dish_name: name,
      display_name: name,
      aliases: [],
      entity_kind: "COMPOSITE",
      business_type: "MENU",
      menu_cycle: menuCycle
    },
    assembly_components: normalizedComponents,
    assembly_steps: assemblySteps
  };
  const instructions = assemblySteps.map((step) => `${step.step_no}. ${step.action}`).join("\n");

  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const recipeRes = await client.query(
      `INSERT INTO recipes(
        code, name, description, entity_kind, business_type, technique_family, recipe_type, menu_cycle, import_source, created_by, updated_at
      ) VALUES ($1,$2,$3,'COMPOSITE','MENU','COMPOSITE','MENU',$4,'manual',$5,NOW())
      RETURNING id`,
      [code, name, input.description?.trim() || null, menuCycle, actor.email]
    );
    const recipeId = Number(recipeRes.rows[0].id);
    const versionRes = await client.query(
      `INSERT INTO recipe_versions(
        recipe_id, version_no, status, servings, instructions, record_json, change_note, created_by, updated_at
      ) VALUES ($1,1,'DRAFT',$2,$3,$4::jsonb,$5,$6,NOW())
      RETURNING id`,
      [recipeId, "1道", instructions, JSON.stringify(compositeRecord), input.change_note?.trim() || null, actor.email]
    );
    const versionId = Number(versionRes.rows[0].id);

    for (let idx = 0; idx < normalizedComponents.length; idx += 1) {
      const component = normalizedComponents[idx];
      let linkedRecipe = null;
      if (component.component_kind === "RECIPE_REF" && component.child_code) {
        linkedRecipe = await findRecipeByCodePostgres(component.child_code);
      }
      await client.query(
        `INSERT INTO recipe_version_components(
          parent_version_id, component_kind, child_recipe_id, child_version_id, display_name,
          component_role, section, quantity, unit, sort_order, is_optional, source_ref, prep_note
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          versionId,
          linkedRecipe ? "RECIPE_REF" : component.component_kind,
          linkedRecipe?.id || null,
          linkedRecipe?.active_version_id || null,
          component.ref_name,
          component.component_role || null,
          component.section,
          component.quantity || null,
          component.unit || null,
          Number(component.sort_order || idx + 1),
          Boolean(component.is_optional),
          component.source_ref || null,
          component.prep_note || null
        ]
      );
    }

    await client.query(`UPDATE recipes SET active_version_id = $1, updated_at = NOW() WHERE id = $2`, [versionId, recipeId]);
    await client.query("COMMIT");
    return await getRecipeDetailRepo(recipeId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createRecipeRevisionRepo(recipeId: number, createdBy: string) {
  if (!usePostgresRecipeStore()) return createRecipeRevisionSqlite(recipeId, createdBy);
  const actor = await ensureRecipeRolePostgres(createdBy, ["OWNER", "EDITOR"]);
  const detail = await getRecipeDetailRepo(recipeId);
  if (!detail) throw new Error("NOT_FOUND");
  const latest = detail.versions[0];
  if (!latest) throw new Error("NOT_FOUND");
  const versionNo = await getNextRecipeVersionNoPostgres(recipeId);

  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const versionRes = await client.query(
      `INSERT INTO recipe_versions(
        recipe_id, version_no, status, servings, instructions, record_json, change_note, created_by, updated_at
      ) VALUES ($1,$2,'DRAFT',$3,$4,$5::jsonb,$6,$7,NOW())
      RETURNING id`,
      [
        recipeId,
        versionNo,
        latest.yield || latest.servings || null,
        latest.instructions,
        latest.recipe_record_json || "{}",
        `基于 v${latest.version_no} 创建修订`,
        actor.email
      ]
    );
    const versionId = Number(versionRes.rows[0].id);
    await insertIngredientsPostgres(client, versionId, latest.ingredients);
    await insertComponentsPostgres(client, versionId, latest.components || []);
    await client.query(`UPDATE recipes SET updated_at = NOW() WHERE id = $1`, [recipeId]);
    await client.query("COMMIT");
    const version = await getRecipeVersionRepo(versionId);
    if (!version) throw new Error("NOT_FOUND");
    version.ingredients = await getRecipeIngredientsRepo(versionId);
    version.components = await getRecipeComponentsRepo(versionId);
    return version;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function cloneRecipeVersionToDraftRepo(versionId: number, actorEmail: string, note: string) {
  const source = await getRecipeVersionRepo(versionId);
  if (!source) throw new Error("NOT_FOUND");
  const sourceIngredients = await getRecipeIngredientsRepo(versionId);
  const sourceComponents = await getRecipeComponentsRepo(versionId);
  const nextVersionNo = await getNextRecipeVersionNoPostgres(source.recipe_id);
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const versionResult = await client.query(
      `INSERT INTO recipe_versions(
        recipe_id, version_no, status, servings, instructions, record_json, change_note, created_by, updated_at
      ) VALUES ($1,$2,'DRAFT',$3,$4,$5::jsonb,$6,$7,NOW())
      RETURNING id`,
      [
        source.recipe_id,
        nextVersionNo,
        source.yield || source.servings || null,
        source.instructions,
        source.recipe_record_json || "{}",
        note,
        actorEmail
      ]
    );
    const newVersionId = Number(versionResult.rows[0].id);
    await insertIngredientsPostgres(client, newVersionId, sourceIngredients);
    await insertComponentsPostgres(client, newVersionId, sourceComponents);
    await client.query(`UPDATE recipes SET updated_at = NOW() WHERE id = $1`, [source.recipe_id]);
    await client.query("COMMIT");
    return newVersionId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createImportedRecipeDraftsRepo(input: Parameters<typeof createImportedRecipeDraftsSqlite>[0]) {
  if (!usePostgresRecipeStore()) return createImportedRecipeDraftsSqlite(input);
  const actor = await ensureRecipeRolePostgres(input.actor_email, ["OWNER", "EDITOR"]);
  if (!Array.isArray(input.recipes) || input.recipes.length < 1) throw new Error("RECIPES_REQUIRED");
  const preview = input.v3_preview && typeof input.v3_preview === "object" ? input.v3_preview : null;
  const previewMode = String((preview as any)?.mode || "");
  const previewElements = Array.isArray((preview as any)?.elements) ? (preview as any).elements : [];

  const pool = getPostgresPool();
  const client = await pool.connect();

  const createElementDraftPg = async (
    normalized: any,
    options?: {
      codeSeed?: string;
      business_type?: "MENU" | "BACKBONE";
      technique_family?: string | null;
      import_note?: string;
      entity_kind?: "ELEMENT" | "COMPOSITE";
      record_json?: string;
      instructions_override?: string;
    }
  ) => {
    const businessType = options?.business_type || (normalized.meta.business_type === "MENU" ? "MENU" : "BACKBONE");
    const dishName = String(normalized.meta.dish_name || "").trim();
    if (!dishName) throw new Error("DISH_NAME_REQUIRED");
    const menuCycle = businessType === "MENU" ? normalizeMenuCycle(normalized.meta.menu_cycle) : null;
    const code = await ensureUniqueRecipeCodePostgres(options?.codeSeed || normalized.meta.dish_code || `AUTO_${Date.now()}`);
    const nextRecord = {
      ...normalized,
      meta: {
        ...normalized.meta,
        dish_code: code,
        dish_name: dishName,
        display_name: normalized.meta.display_name || dishName,
        aliases: Array.isArray(normalized.meta.aliases) ? normalized.meta.aliases : [],
        entity_kind: options?.entity_kind || "ELEMENT",
        business_type: businessType,
        technique_family: String(options?.technique_family || normalized.meta.technique_family || "OTHER"),
        menu_cycle: menuCycle
      },
      production: {
        ...normalized.production,
        yield: String(normalized.production.yield || "1份"),
        net_yield_rate: Number.isFinite(Number(normalized.production.net_yield_rate))
          ? Number(normalized.production.net_yield_rate) || 1
          : 1
      },
      component_refs: Array.isArray(normalized.component_refs) ? normalized.component_refs : []
    };
    const instructions = options?.instructions_override || (Array.isArray(nextRecord.steps) ? nextRecord.steps
      .sort((a: any, b: any) => Number(a.step_no) - Number(b.step_no))
      .map((step: any) => `${step.step_no}. ${step.action}`)
      .join("\n") : "");
    const recipeRes = await client.query(
      `INSERT INTO recipes(
        code, name, description, entity_kind, business_type, technique_family, recipe_type, menu_cycle, import_source, created_by, updated_at
      ) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,'import',$8,NOW())
      RETURNING id`,
      [
        code,
        dishName,
        options?.entity_kind || "ELEMENT",
        businessType,
        options?.technique_family || null,
        businessType,
        menuCycle,
        actor.email
      ]
    );
    const recipeId = Number(recipeRes.rows[0].id);
    const versionRes = await client.query(
      `INSERT INTO recipe_versions(
        recipe_id, version_no, status, servings, instructions, record_json, change_note, created_by, updated_at
      ) VALUES ($1,1,'DRAFT',$2,$3,$4::jsonb,$5,$6,NOW())
      RETURNING id`,
      [
        recipeId,
        nextRecord.production.yield || "1份",
        instructions,
        options?.record_json || JSON.stringify(nextRecord),
        options?.import_note || "智能导入创建",
        actor.email
      ]
    );
    const versionId = Number(versionRes.rows[0].id);
    await insertIngredientsPostgres(client, versionId, nextRecord.ingredients || []);
    await client.query(`UPDATE recipes SET active_version_id = $1, updated_at = NOW() WHERE id = $2`, [versionId, recipeId]);
    return {
      recipe_id: recipeId,
      version_id: versionId,
      version: "v1",
      status: "DRAFT",
      dish_name: dishName,
      code,
      recipe_type: businessType
    };
  };

  try {
    await client.query("BEGIN");
    const created: any[] = [];

    if (preview && previewMode === "COMPOSITE" && (preview as any).composite) {
      const createdByPreviewCode = new Map<string, any>();
      for (let i = 0; i < input.recipes.length; i += 1) {
        const normalized = input.recipes[i] as any;
        const previewElement = previewElements.find((item: any) => Number(item?.index) === i) || previewElements[i] || null;
        const createdElement = await createElementDraftPg(normalized, {
          codeSeed: previewElement?.dish_code || normalized.meta.dish_code,
          business_type: previewElement?.business_type === "BACKBONE" ? "BACKBONE" : "MENU",
          technique_family: previewElement?.technique_family ? String(previewElement.technique_family) : null,
          import_note: "V3-lite 复合菜子配方导入",
          entity_kind: "ELEMENT"
        });
        created.push(createdElement);
        if (previewElement?.dish_code) createdByPreviewCode.set(String(previewElement.dish_code), createdElement);
      }

      const compositeRaw = (preview as any).composite;
      const compositeCode = await ensureUniqueRecipeCodePostgres(compositeRaw.dish_code || `AUTO_COMPOSITE_${Date.now()}`);
      const compositeRecord = {
        meta: {
          dish_code: compositeCode,
          dish_name: String(compositeRaw.dish_name || "").trim(),
          display_name: String(compositeRaw.display_name || compositeRaw.dish_name || "").trim(),
          aliases: Array.isArray(compositeRaw.aliases) ? compositeRaw.aliases : [],
          entity_kind: "COMPOSITE",
          business_type: "MENU",
          menu_cycle: compositeRaw.menu_cycle ? normalizeMenuCycle(String(compositeRaw.menu_cycle)) : null
        },
        assembly_components: Array.isArray(compositeRaw.assembly_components) ? compositeRaw.assembly_components : [],
        assembly_steps: Array.isArray(compositeRaw.assembly_steps) ? compositeRaw.assembly_steps : []
      };
      const compositeNormalized = {
        meta: {
          dish_code: compositeCode,
          dish_name: compositeRecord.meta.dish_name,
          display_name: compositeRecord.meta.display_name,
          aliases: compositeRecord.meta.aliases,
          entity_kind: "ELEMENT",
          business_type: "MENU",
          technique_family: "OTHER",
          menu_cycle: compositeRecord.meta.menu_cycle,
          plating_image_url: ""
        },
        production: { yield: "1道", net_yield_rate: 1, key_temperature_points: [] },
        allergens: [],
        diet_flags: [],
        ingredients: [{ name: "见 assembly components", quantity: "1", unit: "组", note: "V3-lite composite placeholder" }],
        steps: compositeRecord.assembly_steps.length > 0
          ? compositeRecord.assembly_steps.map((step: any, idx: number) => ({
              step_id: step?.step_id || `step_${String(idx + 1).padStart(3, "0")}`,
              step_no: Number(step?.step_no || idx + 1),
              action: String(step?.action || "").trim() || "待填写",
              time_sec: 0
            }))
          : [{ step_id: "step_001", step_no: 1, action: "待填写整道菜 assembly 动作", time_sec: 0 }],
        component_refs: []
      };
      const compositeCreated = await createElementDraftPg(compositeNormalized, {
        codeSeed: compositeCode,
        business_type: "MENU",
        technique_family: "COMPOSITE",
        import_note: "V3-lite 复合菜导入",
        entity_kind: "COMPOSITE",
        record_json: JSON.stringify(compositeRecord),
        instructions_override: compositeRecord.assembly_steps
          .map((step: any, idx: number) => `${Number(step?.step_no || idx + 1)}. ${String(step?.action || "").trim()}`)
          .filter(Boolean)
          .join("\n")
      });

      const assemblyComponents = Array.isArray(compositeRaw.assembly_components) ? compositeRaw.assembly_components : [];
      for (let idx = 0; idx < assemblyComponents.length; idx += 1) {
        const component = assemblyComponents[idx];
        const linked = component?.child_code ? createdByPreviewCode.get(String(component.child_code)) : undefined;
        await client.query(
          `INSERT INTO recipe_version_components(
            parent_version_id, component_kind, child_recipe_id, child_version_id, display_name,
            component_role, section, quantity, unit, sort_order, is_optional, source_ref, prep_note
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            compositeCreated.version_id,
            linked ? "RECIPE_REF" : String(component?.component_kind || "REFERENCE_PREP"),
            linked?.recipe_id || null,
            linked?.version_id || null,
            String(component?.ref_name || linked?.dish_name || component?.child_code || `component-${idx + 1}`),
            component?.component_role ? String(component.component_role) : null,
            component?.section ? String(component.section) : "ASSEMBLY",
            component?.quantity ? String(component.quantity) : null,
            component?.unit ? String(component.unit) : null,
            Number(component?.sort_order || idx + 1),
            Boolean(component?.is_optional),
            null,
            null
          ]
        );
      }

      const unresolvedRefs = Array.isArray((preview as any).unresolved_refs) ? (preview as any).unresolved_refs : [];
      for (let idx = 0; idx < unresolvedRefs.length; idx += 1) {
        const item = unresolvedRefs[idx];
        await client.query(
          `INSERT INTO recipe_version_components(
            parent_version_id, component_kind, child_recipe_id, child_version_id, display_name,
            component_role, section, quantity, unit, sort_order, is_optional, source_ref, prep_note
          ) VALUES ($1,'REFERENCE_PREP',NULL,NULL,$2,NULL,'PREP',$3,$4,$5,false,$6,NULL)`,
          [
            compositeCreated.version_id,
            String(item?.ref_name || `ref-${idx + 1}`),
            item?.quantity ? String(item.quantity) : null,
            item?.unit ? String(item.unit) : null,
            1000 + idx,
            item?.source_ref ? String(item.source_ref) : null
          ]
        );
      }

      const finishItems = Array.isArray((preview as any).finish_items) ? (preview as any).finish_items : [];
      for (let idx = 0; idx < finishItems.length; idx += 1) {
        const item = finishItems[idx];
        await client.query(
          `INSERT INTO recipe_version_components(
            parent_version_id, component_kind, child_recipe_id, child_version_id, display_name,
            component_role, section, quantity, unit, sort_order, is_optional, source_ref, prep_note
          ) VALUES ($1,'FINISH_ITEM',NULL,NULL,$2,'PLATING','PLATING',$3,$4,$5,false,$6,NULL)`,
          [
            compositeCreated.version_id,
            String(item?.ref_name || `finish-${idx + 1}`),
            item?.quantity ? String(item.quantity) : null,
            item?.unit ? String(item.unit) : null,
            2000 + idx,
            item?.source_ref ? String(item.source_ref) : null
          ]
        );
      }

      created.unshift(compositeCreated);
      await client.query("COMMIT");
      return created;
    }

    for (let i = 0; i < input.recipes.length; i += 1) {
      const normalized = input.recipes[i] as any;
      const previewElement = previewElements.find((item: any) => Number(item?.index) === i) || previewElements[i] || null;
      created.push(await createElementDraftPg(normalized, {
        codeSeed: normalized.meta.dish_code,
        business_type: previewElement?.business_type === "MENU" ? "MENU" : previewElement?.business_type === "BACKBONE" ? "BACKBONE" : undefined,
        technique_family: previewElement?.technique_family ? String(previewElement.technique_family) : null,
        import_note: "智能导入创建",
        entity_kind: "ELEMENT"
      }));
    }

    await client.query("COMMIT");
    return created;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function confirmSmartEditRepo(...args: Parameters<typeof confirmSmartEditSqlite>) {
  if (!usePostgresRecipeStore()) return confirmSmartEditSqlite(...args);
  const [input] = args;
  const actor = await ensureRecipeRolePostgres(input.actor_email, ["OWNER", "EDITOR"]);
  const source = await getRecipeVersionRepo(input.version_id);
  if (!source || source.recipe_id !== input.recipe_id) throw new Error("NOT_FOUND");
  const modifiedRecord = input.modified_record as any;
  if (!modifiedRecord || typeof modifiedRecord !== "object") {
    throw new Error("INVALID_RECIPE_RECORD:modified_record.invalid");
  }

  const normalizedIngredients = Array.isArray(modifiedRecord.ingredients)
    ? modifiedRecord.ingredients.map((item: any) => ({
        name: String(item?.name || "").trim(),
        quantity: String(item?.quantity || "").trim(),
        unit: String(item?.unit || "").trim(),
        note: String(item?.note || "").trim()
      }))
    : [];
  const instructions = Array.isArray(modifiedRecord.steps)
    ? modifiedRecord.steps
        .sort((a: any, b: any) => Number(a?.step_no || 0) - Number(b?.step_no || 0))
        .map((step: any) => `${Number(step?.step_no || 0)}. ${String(step?.action || "").trim()}`)
        .filter(Boolean)
        .join("\n")
    : "";

  const newVersionId = await cloneRecipeVersionToDraftRepo(
    input.version_id,
    actor.email,
    `智能微调: 基于 v${source.version_no} 创建`
  );
  await updateRecipeDraftRepo(newVersionId, {
    yield: String(modifiedRecord?.production?.yield || source.yield || source.servings || ""),
    instructions,
    ingredients: normalizedIngredients,
    recipe_record_json: modifiedRecord,
    actor: actor.email
  });
  const created = await getRecipeVersionRepo(newVersionId);
  if (!created) throw new Error("NOT_FOUND");
  return {
    new_version_id: created.id,
    new_version: `v${created.version_no}`,
    status: created.status
  };
}

export async function updateRecipeBaseRepo(...args: Parameters<typeof updateRecipeBaseSqlite>) {
  if (!usePostgresRecipeStore()) return updateRecipeBaseSqlite(...args);
  const [recipeId, input] = args;
  await ensureRecipeRolePostgres(input.actor, ["OWNER", "EDITOR"]);
  const existing = await getRecipeDetailRepo(recipeId);
  if (!existing) throw new Error("NOT_FOUND");
  const code = normalizeRecipeCode(input.code ?? existing.code);
  const name = String(input.name ?? existing.name).trim();
  const businessType =
    input.business_type === "MENU" || input.recipe_type === "MENU"
      ? "MENU"
      : input.business_type === "BACKBONE" || input.recipe_type === "BACKBONE"
        ? "BACKBONE"
        : existing.business_type;
  const menuCycle = businessType === "MENU" ? normalizeMenuCycle(input.menu_cycle ?? existing.menu_cycle) : null;
  if (!code || !name) throw new Error("INVALID_RECIPE_FIELDS");
  if (businessType === "MENU" && !menuCycle) throw new Error("MENU_CYCLE_REQUIRED");
  const pool = getPostgresPool();
  await pool.query(
    `UPDATE recipes
     SET code = $1, name = $2, description = $3, business_type = $4, recipe_type = $5, menu_cycle = $6, updated_at = NOW()
     WHERE id = $7`,
    [code, name, typeof input.description === "string" ? input.description.trim() : existing.description, businessType, businessType, menuCycle, recipeId]
  );
  return getRecipeDetailRepo(recipeId);
}

export async function deleteRecipeRepo(...args: Parameters<typeof deleteRecipeSqlite>) {
  if (!usePostgresRecipeStore()) return deleteRecipeSqlite(...args);
  const [recipeId, input] = args;
  const actor = await ensureRecipeRolePostgres(input.actor, ["OWNER", "EDITOR"]);
  const existing = await getRecipeDetailRepo(recipeId);
  if (!existing) throw new Error("NOT_FOUND");
  const versionIds = existing.versions.map((version) => Number(version.id)).filter(Boolean);
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM recipe_version_components WHERE child_recipe_id = $1`, [recipeId]);
    if (versionIds.length > 0) {
      await client.query(`DELETE FROM recipe_version_components WHERE child_version_id = ANY($1::bigint[])`, [versionIds]);
    }
    await client.query(`DELETE FROM recipe_sync_logs WHERE recipe_id = $1`, [recipeId]);
    await client.query(`DELETE FROM recipes WHERE id = $1`, [recipeId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return {
    id: existing.id,
    code: existing.code,
    name: existing.name,
    deleted: true,
    actor: actor.email
  };
}

export async function updateRecipeDraftRepo(...args: Parameters<typeof updateRecipeDraftSqlite>) {
  if (!usePostgresRecipeStore()) return updateRecipeDraftSqlite(...args);
  const [versionId, input] = args;
  const actor = await ensureRecipeRolePostgres(input.actor, ["OWNER", "EDITOR"]);
  const version = await getRecipeVersionRepo(versionId);
  if (!version) throw new Error("NOT_FOUND");
  if (version.status !== "DRAFT" && version.status !== "REJECTED") throw new Error("INVALID_STAGE");
  const recipeDetail = await getRecipeDetailRepo(version.recipe_id);
  if (!recipeDetail) throw new Error("NOT_FOUND");
  const instructions = String(input.instructions || version.instructions || "").trim();
  if (!instructions) throw new Error("INSTRUCTIONS_REQUIRED");
  const yieldValue = String(input.yield || input.servings || version.yield || version.servings || "").trim();

  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (recipeDetail.entity_kind === "COMPOSITE") {
      const compositeRecord = typeof input.recipe_record_json === "string"
        ? JSON.parse(input.recipe_record_json)
        : input.recipe_record_json;
      await client.query(
        `UPDATE recipe_versions
         SET servings = $1, instructions = $2, record_json = $3::jsonb, change_note = $4, created_by = $5, updated_at = NOW()
         WHERE id = $6`,
        [yieldValue || "1道", instructions, JSON.stringify(compositeRecord), input.change_note?.trim() ?? version.change_note, actor.email, versionId]
      );
      await client.query(`DELETE FROM recipe_version_components WHERE parent_version_id = $1`, [versionId]);
      const components = Array.isArray((compositeRecord as any)?.assembly_components) ? (compositeRecord as any).assembly_components : [];
      for (let index = 0; index < components.length; index += 1) {
        const item = components[index];
        let linkedRecipe = null;
        if (String(item?.component_kind || "") === "RECIPE_REF" && item?.child_code) {
          linkedRecipe = await findRecipeByCodePostgres(String(item.child_code));
        }
        await client.query(
          `INSERT INTO recipe_version_components(
            parent_version_id, component_kind, child_recipe_id, child_version_id, display_name,
            component_role, section, quantity, unit, sort_order, is_optional, source_ref, prep_note
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            versionId,
            String(item?.component_kind || "REFERENCE_PREP"),
            linkedRecipe?.id || null,
            linkedRecipe?.active_version_id || null,
            String(item?.ref_name || item?.child_code || `component-${index + 1}`),
            item?.component_role ? String(item.component_role) : null,
            String(item?.section || "ASSEMBLY"),
            item?.quantity ? String(item.quantity) : null,
            item?.unit ? String(item.unit) : null,
            Number(item?.sort_order || index + 1),
            Boolean(item?.is_optional),
            item?.source_ref ? String(item.source_ref) : null,
            item?.prep_note ? String(item.prep_note) : null
          ]
        );
      }
    } else {
      const recordObject = typeof input.recipe_record_json === "string"
        ? JSON.parse(input.recipe_record_json)
        : input.recipe_record_json;
      await client.query(
        `UPDATE recipe_versions
         SET servings = $1, instructions = $2, record_json = $3::jsonb, change_note = $4, created_by = $5, updated_at = NOW()
         WHERE id = $6`,
        [yieldValue || null, instructions, JSON.stringify(recordObject), input.change_note?.trim() ?? version.change_note, actor.email, versionId]
      );
      if (Array.isArray(input.ingredients) && input.ingredients.length > 0) {
        await client.query(`DELETE FROM recipe_ingredients WHERE recipe_version_id = $1`, [versionId]);
        await insertIngredientsPostgres(client, versionId, input.ingredients);
      }
    }
    await client.query(`UPDATE recipes SET updated_at = NOW() WHERE id = $1`, [version.recipe_id]);
    await client.query("COMMIT");
    const updated = await getRecipeVersionRepo(versionId);
    if (!updated) throw new Error("NOT_FOUND");
    updated.ingredients = await getRecipeIngredientsRepo(versionId);
    updated.components = await getRecipeComponentsRepo(versionId);
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function submitRecipeForReviewRepo(...args: Parameters<typeof submitRecipeForReviewSqlite>) {
  if (!usePostgresRecipeStore()) return submitRecipeForReviewSqlite(...args);
  const [versionId, actorEmail, changeNote] = args;
  const actor = await ensureRecipeRolePostgres(actorEmail, ["OWNER", "EDITOR"]);
  const version = await getRecipeVersionRepo(versionId);
  if (!version) throw new Error("NOT_FOUND");
  if (version.status !== "DRAFT" && version.status !== "REJECTED") throw new Error("INVALID_STAGE");
  const detail = await getRecipeDetailRepo(version.recipe_id);
  if (!detail) throw new Error("NOT_FOUND");
  if (detail.business_type === "MENU" && !normalizeMenuCycle(detail.menu_cycle)) throw new Error("MENU_CYCLE_REQUIRED");
  const ingredients = await getRecipeIngredientsRepo(versionId);
  if (ingredients.length < 1) throw new Error("INGREDIENTS_REQUIRED");
  const pool = getPostgresPool();
  await pool.query(
    `UPDATE recipe_versions
     SET status = 'PENDING_REVIEW', submitted_at = NOW(), change_note = COALESCE($1, change_note), updated_at = NOW(), created_by = $2
     WHERE id = $3`,
    [changeNote?.trim() || null, actor.email, versionId]
  );
  await pool.query(`UPDATE recipes SET updated_at = NOW() WHERE id = $1`, [version.recipe_id]);
  const updated = await getRecipeVersionRepo(versionId);
  if (!updated) throw new Error("NOT_FOUND");
  updated.ingredients = ingredients;
  updated.components = await getRecipeComponentsRepo(versionId);
  return updated;
}

export async function reviewRecipeVersionRepo(...args: Parameters<typeof reviewRecipeVersionSqlite>) {
  if (!usePostgresRecipeStore()) return reviewRecipeVersionSqlite(...args);
  const [versionId, reviewerEmail, decision, reviewNote] = args;
  const reviewer = await ensureRecipeRolePostgres(reviewerEmail, ["OWNER", "REVIEWER"]);
  const version = await getRecipeVersionRepo(versionId);
  if (!version) throw new Error("NOT_FOUND");
  if (version.status !== "PENDING_REVIEW") throw new Error("INVALID_STAGE");
  const nextStatus = decision === "approve" ? "APPROVED" : "REJECTED";
  const pool = getPostgresPool();
  await pool.query(
    `UPDATE recipe_versions
     SET status = $1,
         approved_at = CASE WHEN $2 = 'APPROVED' THEN NOW() ELSE NULL END,
         reviewed_by = $3,
         review_note = $4,
         updated_at = NOW()
     WHERE id = $5`,
    [nextStatus, nextStatus, reviewer.email, reviewNote?.trim() || null, versionId]
  );
  await pool.query(`UPDATE recipes SET updated_at = NOW() WHERE id = $1`, [version.recipe_id]);
  const updated = await getRecipeVersionRepo(versionId);
  if (!updated) throw new Error("NOT_FOUND");
  updated.ingredients = await getRecipeIngredientsRepo(versionId);
  updated.components = await getRecipeComponentsRepo(versionId);
  return updated;
}

export async function publishRecipeVersionRepo(...args: Parameters<typeof publishRecipeVersionSqlite>) {
  if (!usePostgresRecipeStore()) return publishRecipeVersionSqlite(...args);
  const [versionId, publisherEmail] = args;
  await ensureRecipeRolePostgres(publisherEmail, ["OWNER", "REVIEWER"]);
  const version = await getRecipeVersionRepo(versionId);
  if (!version) throw new Error("NOT_FOUND");
  if (version.status !== "APPROVED") throw new Error("INVALID_STAGE");
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE recipe_versions SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW() WHERE id = $1`, [versionId]);
    await client.query(`UPDATE recipes SET active_version_id = $1, updated_at = NOW() WHERE id = $2`, [versionId, version.recipe_id]);
    await client.query("COMMIT");
    const updated = await getRecipeVersionRepo(versionId);
    if (!updated) throw new Error("NOT_FOUND");
    updated.ingredients = await getRecipeIngredientsRepo(versionId);
    updated.components = await getRecipeComponentsRepo(versionId);
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function logRecipeSyncRepo(input: Parameters<typeof logRecipeSyncSqlite>[0]) {
  if (!usePostgresRecipeStore()) return logRecipeSyncSqlite(input);
  const pool = getPostgresPool();
  await pool.query(
    `INSERT INTO recipe_sync_logs(recipe_id, recipe_version_id, event, status, endpoint, error_message)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [input.recipe_id, input.recipe_version_id, input.event, input.status, input.endpoint || null, input.error_message || null]
  );
}
