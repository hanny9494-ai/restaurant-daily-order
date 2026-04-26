"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import { mergeMenuCycles, readLocalMenuCycles } from "@/lib/menu-cycles";
import RecipeWorkbenchShell from "@/components/RecipeWorkbenchShell";
import RecipeComposeDishPanel from "@/components/RecipeComposeDishPanel";
import RecipeEditWorkbenchPanel from "@/components/RecipeEditWorkbenchPanel";
import type { RecipeSummary, RecipeUser, UnitOption } from "@/lib/types";

const FALLBACK_USERS: RecipeUser[] = [
  { id: 1, name: "系统管理员", email: "owner@restaurant.local", role: "OWNER", is_active: 1 },
  { id: 2, name: "行政总厨", email: "chef@restaurant.local", role: "EDITOR", is_active: 1 }
];

type ImportedRecipe = {
  meta: {
    dish_code: string;
    dish_name: string;
    display_name: string;
    aliases: string[];
    entity_kind: "ELEMENT";
    business_type: "MENU" | "BACKBONE";
    technique_family: string;
    menu_cycle: string | null;
    plating_image_url: string;
  };
  production: {
    yield: string;
    net_yield_rate: number;
    key_temperature_points: Array<{ point_id?: string; step: string; temp_c: number; hold_sec: number; note?: string }>;
  };
  allergens: string[];
  diet_flags?: string[];
  ingredients: Array<{ name: string; quantity: string; unit: string; note?: string }>;
  steps: Array<{ step_id?: string; step_no: number; action: string; time_sec: number; temp_c?: number; equipment?: string[]; note?: string }>;
  component_refs?: Array<Record<string, any>>;
};

type ImportReview = {
  needs_manual_review: boolean;
  reasons: string[];
  detected_components_count: number;
  detected_recipe_count: number;
};

type V3PreviewElement = {
  index: number;
  dish_code: string;
  dish_name: string;
  display_name: string;
  aliases: string[];
  entity_kind: "ELEMENT";
  business_type: "MENU" | "BACKBONE";
  technique_family: string;
  component_role: string;
  section: string;
};

type V3PreviewRef = {
  id: string;
  component_kind: "REFERENCE_PREP" | "FINISH_ITEM";
  ref_name: string;
  source_ref?: string;
  quantity?: string;
  unit?: string;
};

type V3Preview = {
  mode: "COMPOSITE" | "ELEMENT_LIBRARY" | "SINGLE_ELEMENT";
  source_pattern: string;
  composite: null | {
    dish_code: string;
    dish_name: string;
    display_name: string;
    aliases: string[];
    entity_kind: "COMPOSITE";
    business_type: "MENU";
    menu_cycle: string | null;
    assembly_components: Array<{
      component_kind: string;
      child_code?: string;
      ref_name: string;
      component_role: string;
      section: string;
      sort_order: number;
      quantity?: string;
      unit?: string;
    }>;
    assembly_steps: Array<{
      step_id: string;
      step_no: number;
      action: string;
    }>;
  };
  elements: V3PreviewElement[];
  unresolved_refs: V3PreviewRef[];
  finish_items: V3PreviewRef[];
};

type ImportStage = "idle" | "uploading" | "parsing" | "review" | "ready" | "error";
type RuntimeStatus = {
  mode: "persistent" | "ephemeral";
  provider: string;
  reason: string;
};

type ImportEditorState = {
  recipeIndex: number;
  panel: "meta" | "ingredients" | "steps";
} | null;

const FALLBACK_UNITS: UnitOption[] = [
  { id: 1, name: "g", is_active: 1 },
  { id: 2, name: "kg", is_active: 1 },
  { id: 3, name: "ml", is_active: 1 },
  { id: 4, name: "L", is_active: 1 },
  { id: 5, name: "pcs", is_active: 1 },
  { id: 6, name: "ea", is_active: 1 },
  { id: 7, name: "个", is_active: 1 },
  { id: 8, name: "只", is_active: 1 },
  { id: 9, name: "片", is_active: 1 },
  { id: 10, name: "根", is_active: 1 },
  { id: 11, name: "斤", is_active: 1 },
  { id: 12, name: "份", is_active: 1 },
  { id: 13, name: "batch", is_active: 1 },
  { id: 14, name: "TT", is_active: 1 }
];

const ALLERGEN_LIBRARY = [
  "GLUTEN",
  "WHEAT",
  "CRUSTACEAN_SHELLFISH",
  "MOLLUSK",
  "FISH",
  "EGG",
  "MILK_DAIRY",
  "PEANUT",
  "TREE_NUT",
  "SOY",
  "SESAME",
  "MUSTARD",
  "CELERY",
  "SULFITE"
];

const DIET_PROFILE_LIBRARY = [
  "VEGAN",
  "LACTO_VEGETARIAN",
  "OVO_VEGETARIAN",
  "LACTO_OVO_VEGETARIAN",
  "PESCATARIAN",
  "NO_BEEF",
  "NO_PORK",
  "NO_SHELLFISH",
  "NO_DAIRY",
  "NO_GLUTEN"
];

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toBase64FromArrayBuffer(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

function normalizeImportedRecipe(recipe: ImportedRecipe): ImportedRecipe {
  const rawMeta = (recipe as any).meta || {};
  const rawProduction = (recipe as any).production || {};
  const businessType = rawMeta.business_type === "BACKBONE" || rawMeta.recipe_type === "BACKBONE"
    ? "BACKBONE"
    : "MENU";
  return {
    ...recipe,
    meta: {
      dish_code: String(rawMeta.dish_code || "").trim(),
      dish_name: String(rawMeta.dish_name || "").trim(),
      display_name: String(rawMeta.display_name || rawMeta.dish_name || "").trim(),
      aliases: Array.isArray(rawMeta.aliases) ? rawMeta.aliases.map((item: unknown) => String(item || "").trim()).filter(Boolean) : [],
      entity_kind: "ELEMENT",
      business_type: businessType,
      technique_family: String(rawMeta.technique_family || "OTHER"),
      menu_cycle: businessType === "MENU" ? (rawMeta.menu_cycle ? String(rawMeta.menu_cycle).trim() : null) : null,
      plating_image_url: String(rawMeta.plating_image_url || "")
    },
    production: {
      yield: String(rawProduction.yield || rawProduction.servings || ""),
      net_yield_rate: Number.isFinite(Number(rawProduction.net_yield_rate)) ? Number(rawProduction.net_yield_rate) : 1,
      key_temperature_points: Array.isArray(rawProduction.key_temperature_points) ? rawProduction.key_temperature_points : []
    },
    allergens: Array.isArray(recipe.allergens) ? recipe.allergens : [],
    diet_flags: Array.isArray(recipe.diet_flags) ? recipe.diet_flags : [],
    ingredients: Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
      ? recipe.ingredients
      : [{ name: "", quantity: "", unit: "", note: "" }],
    steps: Array.isArray(recipe.steps) && recipe.steps.length > 0
      ? recipe.steps.map((step, idx) => ({
          ...step,
          step_id: step.step_id || `step_${String(idx + 1).padStart(3, "0")}`,
          step_no: Number(step.step_no || idx + 1)
        }))
      : [{ step_id: "step_001", step_no: 1, action: "", time_sec: 0 }],
    component_refs: Array.isArray((recipe as any).component_refs) ? (recipe as any).component_refs : []
  };
}

function getImportedRecipeAutoTag(recipe: ImportedRecipe) {
  const notePool = [
    ...recipe.ingredients.map((item) => String(item.note || "")),
    ...recipe.steps.map((item) => String(item.note || ""))
  ].join(" | ");
  if (notePool.includes("AUTO_TAG:PLATING")) {
    return { code: "PLATING", label: "Plating Component", color: "#1d4ed8", bg: "#0f172a" };
  }
  if (notePool.includes("AUTO_TAG:GARNISH")) {
    return { code: "GARNISH", label: "Garnish Component", color: "#166534", bg: "#052e16" };
  }
  return null;
}

function getImportIssues(recipe: ImportedRecipe) {
  const issues: string[] = [];
  if (!recipe.meta.dish_name.trim()) issues.push("缺菜名");
  if (recipe.meta.business_type === "MENU" && !String(recipe.meta.menu_cycle || "").trim()) issues.push("缺菜单周期");
  if (recipe.ingredients.some((item) => !item.name || !item.quantity || !item.unit)) issues.push("原料不完整");
  if (recipe.steps.some((item) => !item.action)) issues.push("步骤不完整");
  return issues;
}

export default function RecipesHubPage() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const router = useRouter();
  const [queryString, setQueryString] = useState("");
  const [users, setUsers] = useState<RecipeUser[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [menuCycles, setMenuCycles] = useState<string[]>([]);
  const [recipeFilter, setRecipeFilter] = useState<"ALL" | "MENU" | "BACKBONE">("ALL");

  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importWarnings, setImportWarnings] = useState<Array<{ index: number; field: string; message: string }>>([]);
  const [importRecipes, setImportRecipes] = useState<ImportedRecipe[]>([]);
  const [importReview, setImportReview] = useState<ImportReview | null>(null);
  const [importV3Preview, setImportV3Preview] = useState<V3Preview | null>(null);
    const [importEditor, setImportEditor] = useState<ImportEditorState>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importStage, setImportStage] = useState<ImportStage>("idle");
  const [importNotice, setImportNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null);
  const [lastUploadName, setLastUploadName] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [showImportAdvanced, setShowImportAdvanced] = useState(false);
  const activeActorEmail = selectedUser || users.find((user) => user.is_active === 1)?.email || FALLBACK_USERS[0].email;

  async function loadUsers() {
    try {
      const res = await fetch(`${apiBase}/api/recipe-users`);
      const json = await res.json();
      const data = (json.data || []) as RecipeUser[];
      const nextUsers = data.length > 0 ? data : FALLBACK_USERS;
      setUsers(nextUsers);
      if (!selectedUser && nextUsers.length > 0) {
        const preferred = nextUsers.find((u) => u.role === "EDITOR") || nextUsers[0];
        setSelectedUser(preferred.email);
      }
    } catch {
      setUsers(FALLBACK_USERS);
      if (!selectedUser) {
        setSelectedUser(FALLBACK_USERS[0].email);
      }
      setImportNotice({ type: "info", text: "用户列表加载失败，已使用默认操作人。" });
    }
  }

  async function loadUnits() {
    try {
      const res = await fetch(`${apiBase}/api/units`);
      const json = await res.json();
      const data = (json.data || []) as UnitOption[];
      setUnits(data.length > 0 ? data.filter((unit) => unit.is_active === 1) : FALLBACK_UNITS);
    } catch {
      setUnits(FALLBACK_UNITS);
    }
  }

  async function loadRecipes() {
    const res = await fetch(`${apiBase}/api/recipes`);
    const json = await res.json();
    const data = (json.data || []) as RecipeSummary[];
    setRecipes(data);
    setMenuCycles(mergeMenuCycles(data.map((item) => item.menu_cycle), readLocalMenuCycles()));
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setQueryString(window.location.search);
    }
    loadUsers();
    loadUnits();
    loadRecipes();
    fetch(`${apiBase}/api/runtime/status`)
      .then((res) => res.json())
      .then((json) => setRuntimeStatus(json.data?.recipe_store || null))
      .catch(() => setRuntimeStatus(null));
  }, []);

  const isEphemeralStore = runtimeStatus?.mode === "ephemeral";
  const filteredRecipes = useMemo(() => {
    if (recipeFilter === "ALL") return recipes;
    return recipes.filter((item) => item.business_type === recipeFilter);
  }, [recipeFilter, recipes]);
  const importMetrics = useMemo(() => {
    const ingredientCount = importRecipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
    const stepCount = importRecipes.reduce((sum, recipe) => sum + recipe.steps.length, 0);
    const taggedCount = importRecipes.filter((recipe) => Boolean(getImportedRecipeAutoTag(recipe))).length;
    return {
      recipeCount: importRecipes.length,
      ingredientCount,
      stepCount,
      taggedCount,
      unresolvedRefCount: importV3Preview?.unresolved_refs.length || 0
    };
  }, [importRecipes, importV3Preview]);
  const stageLabel = useMemo(() => {
    switch (importStage) {
      case "uploading":
        return "文件接收中";
      case "parsing":
        return "AI 解析中";
      case "review":
        return "等待人工审阅";
      case "ready":
        return "可创建草稿";
      case "error":
        return "解析失败";
      default:
        return "等待导入";
    }
  }, [importStage]);
  const confirmBlockedReason = useMemo(() => {
    if (isEphemeralStore) {
      return runtimeStatus?.reason || "当前环境只用于前端预览，草稿不会稳定写入审批中心。";
    }
    if (importLoading) {
      return "当前仍在处理中，请等待。";
    }
    if (importRecipes.length < 1) {
      return "请先完成导入。";
    }
    return "";
  }, [importLoading, importRecipes.length, isEphemeralStore, runtimeStatus]);
  const isConfirmBlocked = Boolean(confirmBlockedReason);

  function patchImportedRecipe(index: number, patch: Partial<ImportedRecipe>) {
    setImportRecipes((prev) => prev.map((item, idx) => idx === index ? { ...item, ...patch } : item));
  }

  function updateImportedRecipeMeta(index: number, patch: Partial<ImportedRecipe["meta"]>) {
    setImportRecipes((prev) => prev.map((recipe, idx) => idx === index ? {
      ...recipe,
      meta: { ...recipe.meta, ...patch }
    } : recipe));
  }

  function updateImportedIngredient(index: number, ingredientIndex: number, patch: Partial<ImportedRecipe["ingredients"][number]>) {
    setImportRecipes((prev) => prev.map((recipe, idx) => idx === index ? {
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient, currentIdx) => currentIdx === ingredientIndex ? { ...ingredient, ...patch } : ingredient)
    } : recipe));
  }

  function addImportedIngredient(index: number) {
    setImportRecipes((prev) => prev.map((recipe, idx) => idx === index ? {
      ...recipe,
      ingredients: [...recipe.ingredients, { name: "", quantity: "", unit: "", note: "" }]
    } : recipe));
  }

  function removeImportedIngredient(index: number, ingredientIndex: number) {
    setImportRecipes((prev) => prev.map((recipe, idx) => {
      if (idx !== index) return recipe;
      const next = recipe.ingredients.filter((_, currentIdx) => currentIdx !== ingredientIndex);
      return {
        ...recipe,
        ingredients: next.length > 0 ? next : [{ name: "", quantity: "", unit: "", note: "" }]
      };
    }));
  }

  function updateImportedStep(index: number, stepIndex: number, patch: Partial<ImportedRecipe["steps"][number]>) {
    setImportRecipes((prev) => prev.map((recipe, idx) => idx === index ? {
      ...recipe,
      steps: recipe.steps.map((step, currentIdx) => currentIdx === stepIndex ? { ...step, ...patch } : step)
    } : recipe));
  }

  function addImportedStep(index: number) {
    setImportRecipes((prev) => prev.map((recipe, idx) => idx === index ? {
      ...recipe,
      steps: [...recipe.steps, { step_id: `step_${String(recipe.steps.length + 1).padStart(3, "0")}`, step_no: recipe.steps.length + 1, action: "", time_sec: 0 }]
    } : recipe));
  }

  function removeImportedStep(index: number, stepIndex: number) {
    setImportRecipes((prev) => prev.map((recipe, idx) => {
      if (idx !== index) return recipe;
      const next = recipe.steps
        .filter((_, currentIdx) => currentIdx !== stepIndex)
        .map((step, order) => ({ ...step, step_no: order + 1, step_id: step.step_id || `step_${String(order + 1).padStart(3, "0")}` }));
      return {
        ...recipe,
        steps: next.length > 0 ? next : [{ step_id: "step_001", step_no: 1, action: "", time_sec: 0 }]
      };
    }));
  }

  function toggleRecipeTag(index: number, field: "allergens" | "diet_flags", value: string) {
    setImportRecipes((prev) => prev.map((recipe, idx) => {
      if (idx !== index) return recipe;
      const current = Array.isArray(recipe[field]) ? recipe[field] as string[] : [];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { ...recipe, [field]: next };
    }));
  }

  function getUnitChoices(currentUnit: string) {
    const names = Array.from(new Set([...units.map((item) => item.name), currentUnit].filter(Boolean)));
    return names;
  }

  async function parseByText() {
    const content = importText.trim();
    if (!content) {
      alert("请先输入或粘贴食谱内容");
      return;
    }
    if (!activeActorEmail) {
      setImportStage("error");
      setImportNotice({ type: "error", text: "操作人未就绪，请刷新页面后重试。" });
      return;
    }
    setImportStage("parsing");
    setImportNotice({ type: "info", text: "开始解析文本，请稍候..." });
    setImportLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/recipes/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text", content, actor_email: activeActorEmail })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportStage("error");
        setImportNotice({ type: "error", text: `解析失败: ${json.message || json.error || "UNKNOWN_ERROR"}` });
        return;
      }
      const parsed = (json.recipes || []).map(normalizeImportedRecipe);
      setImportRecipes(parsed);
      setImportWarnings(json.warnings || []);
      setImportReview(json.review || null);
      setImportV3Preview(json.v3_preview || null);
      if (parsed.length > 0) {
        setImportStage(json.review?.needs_manual_review ? "review" : "ready");
        setImportNotice({ type: "success", text: `解析成功：识别到 ${parsed.length} 个食谱。` });
      } else {
        setImportStage("error");
        setImportNotice({ type: "info", text: "解析完成，但没有识别到可导入食谱。请检查文本格式。" });
      }
    } finally {
      setImportLoading(false);
    }
  }

  async function parseByFile(file: File) {
    if (!activeActorEmail) {
      setImportStage("error");
      setImportNotice({ type: "error", text: "操作人未就绪，请刷新页面后重试。" });
      return;
    }
    setLastUploadName(file.name);
    setImportStage("uploading");
    setImportNotice({ type: "info", text: `已接收 ${file.name}，正在读取文件...` });
    setImportLoading(true);
    try {
      const nameLower = file.name.toLowerCase();
      const isImage = file.type.startsWith("image/");
      const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || nameLower.endsWith(".docx");
      const isCsv = file.type === "text/csv" || nameLower.endsWith(".csv");
      setImportStage("parsing");
      setImportNotice({ type: "info", text: `上传成功：${file.name}，AI 正在解析...` });
      const payload = isImage
        ? { type: "image", content: await toBase64(file) }
        : isDocx
          ? { type: "docx", content: toBase64FromArrayBuffer(await file.arrayBuffer()) }
          : isCsv
            ? { type: "csv", content: await file.text() }
            : { type: "text", content: await file.text() };
      const res = await fetch(`${apiBase}/api/recipes/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, actor_email: activeActorEmail })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportStage("error");
        setImportNotice({ type: "error", text: `解析失败: ${json.message || json.error || "UNKNOWN_ERROR"}` });
        return;
      }
      const parsed = (json.recipes || []).map(normalizeImportedRecipe);
      setImportRecipes(parsed);
      setImportWarnings(json.warnings || []);
      setImportReview(json.review || null);
      setImportV3Preview(json.v3_preview || null);
      if (parsed.length > 0) {
        setImportStage(json.review?.needs_manual_review ? "review" : "ready");
        setImportNotice({ type: "success", text: `解析成功：识别到 ${parsed.length} 个食谱。` });
      } else {
        setImportStage("error");
        setImportNotice({ type: "info", text: "解析完成，但没有识别到可导入食谱。请检查文件内容或清晰度。" });
      }
    } finally {
      setImportLoading(false);
    }
  }

  async function onDropFile(file: File) {
    if (!file) return;
    await parseByFile(file);
  }

  async function confirmImport() {
    if (!activeActorEmail) {
      alert("当前操作人未就绪，请刷新后重试");
      return;
    }
    if (isEphemeralStore) {
      setImportNotice({ type: "info", text: runtimeStatus?.reason || "当前环境只用于前端预览。要测试真正入库和审批，请使用本地持久数据库环境。" });
      return;
    }
    if (importRecipes.length < 1) {
      alert("没有可创建的食谱");
      return;
    }
    for (let i = 0; i < importRecipes.length; i += 1) {
      const recipe = importRecipes[i];
      if (!recipe.meta.dish_name.trim()) {
        alert(`第 ${i + 1} 条菜名为空`);
        return;
      }
      if (recipe.meta.business_type === "MENU" && !String(recipe.meta.menu_cycle || "").trim()) {
        alert(`第 ${i + 1} 条是 MENU，菜单周期不能为空`);
        return;
      }
      if (recipe.ingredients.length < 1 || recipe.ingredients.some((x) => !x.name || !x.quantity || !x.unit)) {
        alert(`第 ${i + 1} 条原料不完整，请补齐 name/quantity/unit`);
        return;
      }
      if (recipe.steps.length < 1 || recipe.steps.some((x) => !x.action)) {
        alert(`第 ${i + 1} 条步骤不完整，请补齐 action`);
        return;
      }
    }
    setImportLoading(true);
    try {
      const draftItems = importRecipes.map((recipe) => ({
        dish_name: recipe.meta.dish_name,
        dish_code: recipe.meta.dish_code,
        business_type: recipe.meta.business_type,
        technique_family: recipe.meta.technique_family,
        menu_cycle: recipe.meta.menu_cycle,
        plating_image_url: recipe.meta.plating_image_url,
        yield: recipe.production.yield,
        net_yield_rate: recipe.production.net_yield_rate,
        allergens: recipe.allergens,
        diet_flags: recipe.diet_flags,
        ingredients: recipe.ingredients,
        steps: recipe.steps
      }));
      const res = await fetch(`${apiBase}/api/recipes/import/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_items: draftItems,
          actor_email: activeActorEmail,
          v3_preview: importV3Preview,
          auto_submit: true
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`创建失败: ${json.error || "UNKNOWN_ERROR"}`);
        return;
      }
      const submittedCount = Array.isArray(json.submitted) ? json.submitted.length : 0;
      setImportStage("idle");
      setImportRecipes([]);
      setImportWarnings([]);
      setImportText("");
      setLastUploadName("");
      setImportReview(null);
      setImportV3Preview(null);
      setImportEditor(null);
      setImportNotice({ type: "success", text: `已提交 ${submittedCount || json.created?.length || 0} 条审批记录。` });
      await loadRecipes();
      router.push("/recipes/approvals");
    } finally {
      setImportLoading(false);
    }
  }

  const workbenchMode: "import" | "elements" | "compose" = (() => {
    const raw = new URLSearchParams(queryString).get("mode");
    if (raw === "elements" || raw === "edit" || raw === "create") return "elements";
    if (raw === "compose" || raw === "menus") return "compose";
    return "import";
  })();

  function openWorkbenchMode(mode: "import" | "elements" | "compose") {
    const params = new URLSearchParams(queryString);
    if (mode === "import") {
      params.delete("mode");
      params.delete("recipeId");
      params.delete("versionId");
    } else if (mode === "compose") {
      params.set("mode", mode);
      params.delete("recipeId");
      params.delete("versionId");
    } else {
      params.set("mode", mode);
    }
    const nextUrl = `/recipes${params.toString() ? `?${params.toString()}` : ""}`;
    setQueryString(params.toString() ? `?${params.toString()}` : "");
    router.push(nextUrl);
  }

  const workbenchModeSwitch = (
    <section className="ui24-card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className={workbenchMode === "import" ? "ui24-btn" : "ui24-btn ui24-btn-ghost"} type="button" onClick={() => openWorkbenchMode("import")}>导入</button>
          <button className={workbenchMode === "elements" ? "ui24-btn" : "ui24-btn ui24-btn-ghost"} type="button" onClick={() => openWorkbenchMode("elements")}>修改子配方</button>
          <button className={workbenchMode === "compose" ? "ui24-btn" : "ui24-btn ui24-btn-ghost"} type="button" onClick={() => openWorkbenchMode("compose")}>组装菜式</button>
        </div>
      </div>
    </section>
  );

  if (workbenchMode === "elements") {
    return (
      <RecipeWorkbenchShell
        current="hub"
        title="录入工作台"
        description="搜索并修改子配方，只改 Element 内容。"
      >
        {workbenchModeSwitch}
        <Suspense fallback={null}>
          <RecipeEditWorkbenchPanel elementOnly />
        </Suspense>
      </RecipeWorkbenchShell>
    );
  }

  if (workbenchMode === "compose") {
    return (
      <RecipeWorkbenchShell
        current="hub"
        title="录入工作台"
        description="只负责组装母菜单结构，不改子配方原料和步骤。"
      >
        {workbenchModeSwitch}
        <RecipeComposeDishPanel />
      </RecipeWorkbenchShell>
    );
  }

  return (
    <RecipeWorkbenchShell
      current="hub"
      title="录入工作台"
      description="上传、修正、提交审批。"
    >
      {workbenchModeSwitch}
        <section className="ui24-card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ marginBottom: 0 }}>导入</h2>
            <button
              className="ui24-btn ui24-btn-ghost"
              type="button"
              onClick={() => setShowImportAdvanced((prev) => !prev)}
            >
              {showImportAdvanced ? "隐藏高级设置" : "高级设置"}
            </button>
          </div>
          <div className="ui24-statusbar" style={{ marginBottom: 10 }}>
            <div className={`ui24-pill ${
              importStage === "error" ? "ui24-pill-error" :
              importStage === "ready" ? "ui24-pill-success" :
              importStage === "review" ? "ui24-pill-warn" :
              "ui24-pill-info"
            }`}>
              当前状态：{stageLabel}
            </div>
            {lastUploadName ? <div className="ui24-muted">{lastUploadName}</div> : null}
          </div>
          {isEphemeralStore && (
            <div className="ui24-banner ui24-banner-warn">
              当前是临时数据库环境：可测试上传、解析、结构预览；不要把“提交审批”当正式结果。
              {runtimeStatus?.reason ? ` ${runtimeStatus.reason}` : ""}
            </div>
          )}
          {importNotice && (
            <div className={`ui24-banner ${
              importNotice.type === "error" ? "ui24-banner-error" :
              importNotice.type === "success" ? "ui24-banner-success" :
              "ui24-banner-info"
            }`}>
              {importNotice.text}
            </div>
          )}
          {importReview?.needs_manual_review && (
            <div className="ui24-banner ui24-banner-warn">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>复杂导入，建议先审一下结果</div>
              <div className="ui24-muted" style={{ marginBottom: 6 }}>
                识别到 {importReview.detected_recipe_count} 条配方，Components {importReview.detected_components_count} 项
              </div>
              {importReview.reasons.map((reason, idx) => (
                <div key={`reason-${idx}`} style={{ marginBottom: 4 }}>- {reason}</div>
              ))}
            </div>
          )}

          {showImportAdvanced && (
            <div style={{ marginBottom: 10 }}>
              <label className="ui24-label">操作人</label>
              <select className="ui24-select" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} style={{ maxWidth: 420 }}>
                {users.map((user) => (
                  <option key={user.id} value={user.email}>{user.name}</option>
                ))}
              </select>
            </div>
          )}

          <div
            className={`ui24-dropzone ${dragActive ? "ui24-dropzone-active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) onDropFile(file);
            }}
          >
            <p style={{ marginTop: 0 }}>拖拽文件到这里（这是上传区域）</p>
            {lastUploadName && <p className="ui24-muted" style={{ marginTop: -6 }}>最近上传：{lastUploadName}</p>}
            <div className="row">
              <input
                className="ui24-input"
                type="file"
                accept="image/*,.txt,.md,.csv,.docx"
                style={{ maxWidth: 360 }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) parseByFile(file);
                }}
              />
              <button className="ui24-btn ui24-btn-ghost" type="button" onClick={parseByText} disabled={importLoading}>解析文本</button>
              {importLoading && <span className="ui24-muted">AI 解析中（最长90秒）...</span>}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label className="ui24-label">粘贴食谱文本</label>
            <textarea
              className="ui24-textarea"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="粘贴整个食谱内容，点击“解析文本”"
            />
          </div>

          {importWarnings.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {importWarnings.map((w, idx) => (
                <p key={`w-${idx}`} style={{ color: "#ef4444", margin: "4px 0" }}>#{w.index + 1} {w.message}</p>
              ))}
            </div>
          )}
        </section>

        {importV3Preview && (
          <section className="ui24-card" style={{ marginBottom: 14 }}>
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 700, color: "#fff" }}>
                结构总览（可选） · {importV3Preview.mode} · {importMetrics.recipeCount} 条
              </summary>
              <div style={{ marginTop: 12 }}>
                <div className="ui24-grid-2" style={{ gap: 10, marginBottom: 10 }}>
                  <div className="ui24-stat">
                    <div className="ui24-muted">总原料 / 总步骤</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{importMetrics.ingredientCount} / {importMetrics.stepCount}</div>
                  </div>
                  <div className="ui24-stat">
                    <div className="ui24-muted">未解析引用 / 补充项</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{importMetrics.unresolvedRefCount} / {importV3Preview.finish_items.length}</div>
                  </div>
                </div>
                {importV3Preview.composite && (
                  <div className="ui24-card" style={{ background: "#1f1f1f", marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, color: "#fff", marginBottom: 6 }}>
                      Composite：{importV3Preview.composite.display_name}
                    </div>
                    <div className="ui24-muted">
                      components {importV3Preview.composite.assembly_components.length} / steps {importV3Preview.composite.assembly_steps.length}
                    </div>
                  </div>
                )}
                <div className="ui24-grid-2">
                  <div>
                    <label className="ui24-label">Elements</label>
                    <div className="ui24-card" style={{ background: "#1f1f1f" }}>
                      {importV3Preview.elements.map((item) => (
                        <div key={`v3-el-${item.index}`} style={{ padding: "8px 0", borderBottom: "1px solid #2f2f2f" }}>
                          <div style={{ color: "#fff", fontWeight: 600 }}>{item.display_name}</div>
                          <div className="ui24-muted">{item.technique_family} / {item.component_role}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="ui24-label">Refs / Finish Items</label>
                    <div className="ui24-card" style={{ background: "#1f1f1f" }}>
                      {importV3Preview.unresolved_refs.length < 1 && importV3Preview.finish_items.length < 1 && (
                        <div className="ui24-muted">未识别到额外引用</div>
                      )}
                      {importV3Preview.unresolved_refs.map((item) => (
                        <div key={item.id} style={{ padding: "8px 0", borderBottom: "1px solid #2f2f2f" }}>
                          <div style={{ color: "#fff", fontWeight: 600 }}>{item.ref_name}</div>
                          <div className="ui24-muted">REFERENCE_PREP</div>
                        </div>
                      ))}
                      {importV3Preview.finish_items.map((item) => (
                        <div key={item.id} style={{ padding: "8px 0", borderBottom: "1px solid #2f2f2f" }}>
                          <div style={{ color: "#fff", fontWeight: 600 }}>{item.ref_name}</div>
                          <div className="ui24-muted">FINISH_ITEM</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </section>
        )}

        {importRecipes.length > 0 && (
          <section className="ui24-card" style={{ marginBottom: 14 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <h2 style={{ margin: 0 }}>导入结果预览</h2>
                <p className="ui24-muted" style={{ margin: "6px 0 0" }}>先看结果，再分别修原料和步骤。</p>
              </div>
              <div className="ui24-muted">{importRecipes.length} 条待确认</div>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {importRecipes.map((recipe, idx) => {
                const autoTag = getImportedRecipeAutoTag(recipe);
                const issues = getImportIssues(recipe);
                const isEditing = importEditor?.recipeIndex === idx;
                return (
                  <div
                    key={`import-card-${idx}`}
                    className="ui24-card"
                    style={{
                      background: isEditing ? "#202734" : "#171717",
                      borderColor: isEditing ? "#2563eb" : "#333"
                    }}
                  >
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>食谱 {idx + 1}</div>
                        <div style={{
                          color: "#fff",
                          fontWeight: 800,
                          fontSize: 20,
                          lineHeight: 1.3,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          maxWidth: "100%"
                        }}>
                          {recipe.meta.dish_name || "未命名食谱"}
                        </div>
                        <div className="ui24-muted" style={{ marginTop: 4 }}>{recipe.meta.business_type} / {recipe.meta.technique_family || "OTHER"}</div>
                      </div>
                      {autoTag && (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            color: autoTag.color,
                            background: autoTag.bg,
                            border: `1px solid ${autoTag.color}`
                          }}
                        >
                          {autoTag.label}
                        </div>
                      )}
                    </div>

                    <div className="ui24-grid-3" style={{ marginBottom: 10 }}>
                      <button
                        type="button"
                        className="ui24-stat ui24-stat-clickable"
                        style={{ textAlign: "left", cursor: "pointer" }}
                        onClick={() => setImportEditor({ recipeIndex: idx, panel: "ingredients" })}
                      >
                        <div className="ui24-muted">原料</div>
                        <div style={{ color: "#fff", fontSize: 22, fontWeight: 800 }}>{recipe.ingredients.length}</div>
                      </button>
                      <button
                        type="button"
                        className="ui24-stat ui24-stat-clickable"
                        style={{ textAlign: "left", cursor: "pointer" }}
                        onClick={() => setImportEditor({ recipeIndex: idx, panel: "steps" })}
                      >
                        <div className="ui24-muted">步骤</div>
                        <div style={{ color: "#fff", fontSize: 22, fontWeight: 800 }}>{recipe.steps.length}</div>
                      </button>
                      <button
                        type="button"
                        className="ui24-stat ui24-stat-clickable"
                        style={{ textAlign: "left", cursor: "pointer" }}
                        onClick={() => setImportEditor({ recipeIndex: idx, panel: "meta" })}
                      >
                        <div className="ui24-muted">菜单周期</div>
                        <div style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>{recipe.meta.menu_cycle || "-"}</div>
                      </button>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <div className="ui24-muted" style={{ marginBottom: 6 }}>风险检查</div>
                      <div className="ui24-taggrid">
                        {issues.length > 0 ? issues.map((issue) => (
                          <span key={`${recipe.meta.dish_code}-${issue}`} className="ui24-chip" style={{ borderColor: "#7f1d1d", color: "#fecaca" }}>{issue}</span>
                        )) : (
                          <span className="ui24-chip ui24-chip-active">可提交审批</span>
                        )}
                      </div>
                    </div>

                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => setImportEditor({ recipeIndex: idx, panel: "meta" })}>
                        基本信息
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="ui24-btn ui24-btn-ghost"
                type="button"
                onClick={() => {
                  setImportRecipes([]);
                  setImportWarnings([]);
                  setImportReview(null);
                  setImportV3Preview(null);
                  setImportStage("idle");
                }}
              >
                清空结果
              </button>
              <button
                className="ui24-btn"
                type="button"
                onClick={confirmImport}
                disabled={isConfirmBlocked}
              >
                {isEphemeralStore ? "当前环境不允许提交" : "提交审批"}
              </button>
            </div>
            {confirmBlockedReason && (
              <div className="ui24-muted" style={{ marginTop: 8 }}>
                {confirmBlockedReason}
              </div>
            )}
          </section>
        )}

        {importEditor && importRecipes[importEditor.recipeIndex] && (
          <div className="ui24-drawer-backdrop" onClick={() => setImportEditor(null)}>
            <div className="ui24-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <h2 style={{ marginBottom: 4 }}>
                    {importEditor.panel === "meta" ? "基本信息修正" : importEditor.panel === "ingredients" ? "原料修正" : "步骤修正"}
                  </h2>
                  <div className="ui24-muted">{importRecipes[importEditor.recipeIndex].meta.dish_name || "未命名食谱"}</div>
                </div>
                <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => setImportEditor(null)}>确认返回</button>
              </div>

              {importEditor.panel === "meta" && (
                <>
                  <div className="ui24-grid-2">
                    <div className="field">
                      <label>菜名</label>
                      <input
                        className="ui24-input"
                        value={importRecipes[importEditor.recipeIndex].meta.dish_name}
                        onChange={(e) => updateImportedRecipeMeta(importEditor.recipeIndex, { dish_name: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>产出</label>
                      <input
                        className="ui24-input"
                        value={importRecipes[importEditor.recipeIndex].production.yield}
                        onChange={(e) => patchImportedRecipe(importEditor.recipeIndex, {
                          production: {
                            ...importRecipes[importEditor.recipeIndex].production,
                            yield: e.target.value
                          }
                        })}
                      />
                    </div>
                  </div>
                  <div className="ui24-grid-2" style={{ marginTop: 8 }}>
                    <div className="field">
                      <label>业务分类</label>
                      <select
                        className="ui24-select"
                        value={importRecipes[importEditor.recipeIndex].meta.business_type}
                        onChange={(e) => updateImportedRecipeMeta(importEditor.recipeIndex, { business_type: e.target.value as "MENU" | "BACKBONE" })}
                      >
                        <option value="MENU">MENU</option>
                        <option value="BACKBONE">BACKBONE</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>菜单周期</label>
                      <select
                        className="ui24-select"
                        value={importRecipes[importEditor.recipeIndex].meta.menu_cycle || ""}
                        onChange={(e) => updateImportedRecipeMeta(importEditor.recipeIndex, { menu_cycle: e.target.value || null })}
                      >
                        <option value="">未设置</option>
                        {menuCycles.map((cycle) => (
                          <option key={`cycle-${cycle}`} value={cycle}>{cycle}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", color: "#9ca3af" }}>高级字段</summary>
                    <div style={{ marginTop: 10 }}>
                      <label className="ui24-label">编码</label>
                      <input
                        className="ui24-input"
                        value={importRecipes[importEditor.recipeIndex].meta.dish_code}
                        onChange={(e) => updateImportedRecipeMeta(importEditor.recipeIndex, { dish_code: e.target.value })}
                      />
                    </div>
                  </details>
                  <div style={{ marginTop: 10 }}>
                    <label className="ui24-label">过敏源</label>
                    <div className="ui24-taggrid">
                      {ALLERGEN_LIBRARY.map((item) => {
                        const active = importRecipes[importEditor.recipeIndex].allergens.includes(item);
                        return (
                          <button
                            key={`drawer-allergen-${item}`}
                            type="button"
                            className={`ui24-chip ${active ? "ui24-chip-active" : ""}`}
                            onClick={() => toggleRecipeTag(importEditor.recipeIndex, "allergens", item)}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label className="ui24-label">饮食限制</label>
                    <div className="ui24-taggrid">
                      {DIET_PROFILE_LIBRARY.map((item) => {
                        const active = (importRecipes[importEditor.recipeIndex].diet_flags || []).includes(item);
                        return (
                          <button
                            key={`drawer-diet-${item}`}
                            type="button"
                            className={`ui24-chip ${active ? "ui24-chip-active" : ""}`}
                            onClick={() => toggleRecipeTag(importEditor.recipeIndex, "diet_flags", item)}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {importEditor.panel === "ingredients" && (
                <>
                  <div className="ui24-muted" style={{ marginBottom: 10 }}>这里只改原料，不展示步骤表单。</div>
                  {importRecipes[importEditor.recipeIndex].ingredients.map((ingredient, ingredientIndex) => (
                    <div key={`drawer-ing-${ingredientIndex}`} className="ui24-grid-4" style={{ marginBottom: 8 }}>
                      <input className="ui24-input" value={ingredient.name} placeholder="名称" onChange={(e) => updateImportedIngredient(importEditor.recipeIndex, ingredientIndex, { name: e.target.value })} />
                      <input className="ui24-input" value={ingredient.quantity} placeholder="数量" onChange={(e) => updateImportedIngredient(importEditor.recipeIndex, ingredientIndex, { quantity: e.target.value })} />
                      <select className="ui24-select" value={ingredient.unit} onChange={(e) => updateImportedIngredient(importEditor.recipeIndex, ingredientIndex, { unit: e.target.value })}>
                        {getUnitChoices(ingredient.unit).map((unitName) => (
                          <option key={`drawer-unit-${ingredientIndex}-${unitName}`} value={unitName}>{unitName}</option>
                        ))}
                      </select>
                      <div className="row" style={{ gap: 8 }}>
                        <input className="ui24-input" value={ingredient.note || ""} placeholder="备注" onChange={(e) => updateImportedIngredient(importEditor.recipeIndex, ingredientIndex, { note: e.target.value })} />
                        <button className="ui24-btn ui24-btn-danger" type="button" onClick={() => removeImportedIngredient(importEditor.recipeIndex, ingredientIndex)}>删除</button>
                      </div>
                    </div>
                  ))}
                  <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => addImportedIngredient(importEditor.recipeIndex)}>+ 增加原料</button>
                </>
              )}

              {importEditor.panel === "steps" && (
                <>
                  <div className="ui24-muted" style={{ marginBottom: 10 }}>这里只改步骤，不展示原料表单。</div>
                  {importRecipes[importEditor.recipeIndex].steps.map((step, stepIndex) => (
                    <div key={`drawer-step-${stepIndex}`} className="ui24-card" style={{ background: "#171717", marginBottom: 8 }}>
                      <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <input className="ui24-input" style={{ maxWidth: 92 }} value={String(step.step_no)} onChange={(e) => updateImportedStep(importEditor.recipeIndex, stepIndex, { step_no: Number(e.target.value || stepIndex + 1) })} />
                        <input className="ui24-input" style={{ maxWidth: 120 }} placeholder="时长秒" value={step.time_sec > 0 ? String(step.time_sec) : ""} onChange={(e) => updateImportedStep(importEditor.recipeIndex, stepIndex, { time_sec: Number(e.target.value || 0) || 0 })} />
                        <button className="ui24-btn ui24-btn-danger" type="button" onClick={() => removeImportedStep(importEditor.recipeIndex, stepIndex)}>删除</button>
                      </div>
                      <textarea className="ui24-textarea" style={{ minHeight: 84 }} value={step.action} placeholder="步骤动作" onChange={(e) => updateImportedStep(importEditor.recipeIndex, stepIndex, { action: e.target.value })} />
                    </div>
                  ))}
                  <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => addImportedStep(importEditor.recipeIndex)}>+ 增加步骤</button>
                </>
              )}
            </div>
          </div>
        )}
    </RecipeWorkbenchShell>
  );
}
