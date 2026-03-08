"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import type { RecipeSummary, RecipeUser, UnitOption } from "@/lib/types";

const FALLBACK_USERS: RecipeUser[] = [
  { id: 1, name: "系统管理员", email: "owner@restaurant.local", role: "OWNER", is_active: 1 },
  { id: 2, name: "行政总厨", email: "chef@restaurant.local", role: "EDITOR", is_active: 1 }
];

type ImportedRecipe = {
  meta: {
    dish_code: string;
    dish_name: string;
    recipe_type: "MENU" | "BACKBONE";
    menu_cycle: string | null;
    plating_image_url: string;
  };
  production: {
    servings: string;
    net_yield_rate: number;
    key_temperature_points: Array<{ step: string; temp_c: number; hold_sec: number; note?: string }>;
  };
  allergens: string[];
  diet_flags?: string[];
  ingredients: Array<{ name: string; quantity: string; unit: string; note?: string }>;
  steps: Array<{ step_no: number; action: string; time_sec: number; temp_c?: number; note?: string }>;
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
  return {
    ...recipe,
    allergens: Array.isArray(recipe.allergens) ? recipe.allergens : [],
    diet_flags: Array.isArray(recipe.diet_flags) ? recipe.diet_flags : [],
    ingredients: Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
      ? recipe.ingredients
      : [{ name: "", quantity: "", unit: "", note: "" }],
    steps: Array.isArray(recipe.steps) && recipe.steps.length > 0
      ? recipe.steps
      : [{ step_no: 1, action: "", time_sec: 0 }]
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

export default function RecipesHubPage() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const [users, setUsers] = useState<RecipeUser[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [recipeFilter, setRecipeFilter] = useState<"ALL" | "MENU" | "BACKBONE">("ALL");

  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importWarnings, setImportWarnings] = useState<Array<{ index: number; field: string; message: string }>>([]);
  const [importRecipes, setImportRecipes] = useState<ImportedRecipe[]>([]);
  const [importReview, setImportReview] = useState<ImportReview | null>(null);
  const [importV3Preview, setImportV3Preview] = useState<V3Preview | null>(null);
  const [activeDraftIndex, setActiveDraftIndex] = useState(0);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importStage, setImportStage] = useState<ImportStage>("idle");
  const [importNotice, setImportNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null);
  const [lastUploadName, setLastUploadName] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
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
    setRecipes((json.data || []) as RecipeSummary[]);
  }

  useEffect(() => {
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
    return recipes.filter((item) => item.recipe_type === recipeFilter);
  }, [recipeFilter, recipes]);
  const activeDraft = importRecipes[activeDraftIndex] || null;
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
    if (importReview?.needs_manual_review && !reviewConfirmed) {
      return "请先勾选“我已人工审阅配方、原料和步骤”。";
    }
    return "";
  }, [importLoading, importReview, reviewConfirmed, isEphemeralStore, runtimeStatus]);
  const isConfirmBlocked = Boolean(confirmBlockedReason);

  function patchImportedRecipe(index: number, patch: Partial<ImportedRecipe>) {
    setImportRecipes((prev) => prev.map((item, idx) => idx === index ? { ...item, ...patch } : item));
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
      setActiveDraftIndex(0);
      setImportWarnings(json.warnings || []);
      setImportReview(json.review || null);
      setImportV3Preview(json.v3_preview || null);
      setReviewConfirmed(false);
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
      setActiveDraftIndex(0);
      setImportWarnings(json.warnings || []);
      setImportReview(json.review || null);
      setImportV3Preview(json.v3_preview || null);
      setReviewConfirmed(false);
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
      alert("请先选择操作人");
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
      if (recipe.meta.recipe_type === "MENU" && !String(recipe.meta.menu_cycle || "").trim()) {
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
        recipe_type: recipe.meta.recipe_type,
        menu_cycle: recipe.meta.menu_cycle,
        plating_image_url: recipe.meta.plating_image_url,
        servings: recipe.production.servings,
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
          v3_preview: importV3Preview
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`创建失败: ${json.error || "UNKNOWN_ERROR"}`);
        return;
      }
      alert(`成功创建 ${json.created?.length || 0} 个草稿`);
      setImportStage("idle");
      setImportRecipes([]);
      setImportWarnings([]);
      setImportText("");
      setLastUploadName("");
      setImportReview(null);
      setImportV3Preview(null);
      setActiveDraftIndex(0);
      setReviewConfirmed(false);
      setImportNotice({ type: "success", text: `已创建 ${json.created?.length || 0} 个草稿。` });
      await loadRecipes();
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="ui24-body">
      <header className="ui24-topbar">
        <div className="ui24-topbar-inner">
          <div className="ui24-brand">食谱系统</div>
          <Link href="/" className="ui24-btn ui24-btn-ghost">返回首页</Link>
        </div>
      </header>

      <main className="ui24-wrap">
        <section className="ui24-card" style={{ marginBottom: 14 }}>
          <h2 style={{ marginBottom: 10 }}>页面入口</h2>
          <div className="row">
            <Link href="/recipes/new" className="ui24-btn">食谱增加</Link>
            <Link href="/recipes/view" className="ui24-btn ui24-btn-ghost">食谱查看/修改</Link>
            <Link href="/recipes/approvals" className="ui24-btn ui24-btn-ghost">审批中心</Link>
          </div>
        </section>

        <section className="ui24-card" style={{ marginBottom: 14 }}>
          <h2 style={{ marginBottom: 10 }}>智能导入</h2>
          <p className="ui24-muted" style={{ marginBottom: 10 }}>AI 先提取成列表草稿，人工审核后再转换 JSON 入库</p>
          <div className="ui24-statusbar">
            <div className={`ui24-pill ${
              importStage === "error" ? "ui24-pill-error" :
              importStage === "ready" ? "ui24-pill-success" :
              importStage === "review" ? "ui24-pill-warn" :
              "ui24-pill-info"
            }`}>
              当前状态：{stageLabel}
            </div>
            {lastUploadName && <div className="ui24-muted">文件：{lastUploadName}</div>}
          </div>
          {isEphemeralStore && (
            <div className="ui24-banner ui24-banner-warn">
              当前是临时数据库环境：可测试上传、解析、结构预览；不要把“确认创建草稿 / 审批中心”当正式结果。
              {runtimeStatus?.reason ? ` ${runtimeStatus.reason}` : ""}
            </div>
          )}
          <div className="ui24-grid-2" style={{ gap: 10, marginBottom: 14 }}>
            <div className="ui24-card" style={{ background: "#171717" }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>步骤 1</div>
              <div style={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}>上传食谱</div>
              <div className="ui24-muted">拖拽或粘贴整份食谱，先拿到结构化草稿。</div>
            </div>
            <div className="ui24-card" style={{ background: "#171717" }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>步骤 2</div>
              <div style={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}>看结构总览</div>
              <div className="ui24-muted">先确认是复合菜还是基础库，再决定是否逐条修。</div>
            </div>
            <div className="ui24-card" style={{ background: "#171717" }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>步骤 3</div>
              <div style={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}>只改当前草稿</div>
              <div className="ui24-muted">左侧选中一条，右侧只改当前配方，减少干扰。</div>
            </div>
            <div className="ui24-card" style={{ background: "#171717" }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>步骤 4</div>
              <div style={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}>确认创建</div>
              <div className="ui24-muted">审核完成后再入库，不在这里直接写底层 JSON。</div>
            </div>
          </div>
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
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                检测到复杂导入，请先人工审阅
              </div>
              <div className="ui24-muted" style={{ marginBottom: 6 }}>
                识别到 {importReview.detected_recipe_count} 条配方，Components {importReview.detected_components_count} 项
              </div>
              {importReview.reasons.map((reason, idx) => (
                <div key={`reason-${idx}`} style={{ marginBottom: 4 }}>- {reason}</div>
              ))}
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={reviewConfirmed}
                  onChange={(e) => setReviewConfirmed(e.target.checked)}
                />
                我已人工审阅配方、原料和步骤
              </label>
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <label className="ui24-label">操作人</label>
            <select className="ui24-select" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} style={{ maxWidth: 420 }}>
              {users.map((user) => (
                <option key={user.id} value={user.email}>{user.name} / {user.role}</option>
              ))}
            </select>
          </div>

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
            <h2 style={{ marginBottom: 10 }}>V3 结构总览</h2>
            <p className="ui24-muted" style={{ marginTop: 0, marginBottom: 10 }}>
              模式：{importV3Preview.mode} / 来源：{importV3Preview.source_pattern}
            </p>
            <div className="ui24-grid-2" style={{ gap: 10, marginBottom: 10 }}>
              <div className="ui24-stat">
                <div className="ui24-muted">识别草稿数</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{importMetrics.recipeCount}</div>
              </div>
              <div className="ui24-stat">
                <div className="ui24-muted">总原料 / 总步骤</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{importMetrics.ingredientCount} / {importMetrics.stepCount}</div>
              </div>
              <div className="ui24-stat">
                <div className="ui24-muted">Garnish / Plating 标记</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{importMetrics.taggedCount}</div>
              </div>
              <div className="ui24-stat">
                <div className="ui24-muted">未解析引用</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{importMetrics.unresolvedRefCount}</div>
              </div>
            </div>
            {importV3Preview.composite && (
              <div className="ui24-card" style={{ background: "#1f1f1f", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: "#fff", marginBottom: 6 }}>
                  Composite：{importV3Preview.composite.display_name}
                </div>
                <div className="ui24-muted" style={{ marginBottom: 4 }}>
                  code: {importV3Preview.composite.dish_code}
                </div>
                <div className="ui24-muted" style={{ marginBottom: 8 }}>
                  assembly components: {importV3Preview.composite.assembly_components.length} / assembly steps: {importV3Preview.composite.assembly_steps.length}
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
                      <div className="ui24-muted">{item.technique_family} / {item.component_role} / {item.section}</div>
                      <div className="ui24-muted">{item.dish_code}</div>
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
                      <div className="ui24-muted">REFERENCE_PREP {item.source_ref ? `/ ${item.source_ref}` : ""}</div>
                    </div>
                  ))}
                  {importV3Preview.finish_items.map((item) => (
                    <div key={item.id} style={{ padding: "8px 0", borderBottom: "1px solid #2f2f2f" }}>
                      <div style={{ color: "#fff", fontWeight: 600 }}>{item.ref_name}</div>
                      <div className="ui24-muted">FINISH_ITEM {item.quantity || item.unit ? `/ ${item.quantity || ""} ${item.unit || ""}` : ""}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {importRecipes.length > 0 && (
          <section className="ui24-card" style={{ marginBottom: 14 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <h2 style={{ margin: 0 }}>AI 提取草稿工作台</h2>
                <p className="ui24-muted" style={{ margin: "6px 0 0" }}>左侧切换草稿，右侧只改当前项。</p>
              </div>
              <div className="ui24-muted">当前选中：{activeDraft ? activeDraft.meta.dish_name || "未命名草稿" : "-"}</div>
            </div>
            <div className="ui24-grid-2" style={{ alignItems: "start", gap: 14 }}>
              <div className="ui24-card" style={{ background: "#171717" }}>
                <label className="ui24-label">草稿列表</label>
                {importRecipes.map((recipe, idx) => {
                  const autoTag = getImportedRecipeAutoTag(recipe);
                  const isActive = idx === activeDraftIndex;
                  return (
                    <button
                      key={`import-tab-${idx}`}
                      type="button"
                      onClick={() => setActiveDraftIndex(idx)}
                      className={`ui24-listitem ${isActive ? "ui24-listitem-active" : ""}`}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                        <div style={{ fontWeight: 700 }}>{idx + 1}. {recipe.meta.dish_name || "未命名草稿"}</div>
                        <div className="ui24-muted">{recipe.meta.recipe_type}</div>
                      </div>
                      <div className="ui24-muted" style={{ marginBottom: 4 }}>
                        {recipe.ingredients.length} 原料 / {recipe.steps.length} 步骤 / {recipe.allergens.length} 过敏原
                      </div>
                      {autoTag && <div style={{ fontSize: 12, color: autoTag.color }}>{autoTag.label}</div>}
                    </button>
                  );
                })}
              </div>

              {activeDraft && (
                <div className="ui24-card" style={{ background: "#1f1f1f" }}>
                  {getImportedRecipeAutoTag(activeDraft) && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "4px 10px",
                        borderRadius: 999,
                        marginBottom: 10,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        color: getImportedRecipeAutoTag(activeDraft)?.color,
                        background: getImportedRecipeAutoTag(activeDraft)?.bg,
                        border: `1px solid ${getImportedRecipeAutoTag(activeDraft)?.color}`
                      }}
                    >
                      {getImportedRecipeAutoTag(activeDraft)?.label}
                    </div>
                  )}
                  <div className="ui24-grid-2">
                    <div>
                      <label className="ui24-label">菜名</label>
                      <input className="ui24-input" value={activeDraft.meta.dish_name} onChange={(e) => patchImportedRecipe(activeDraftIndex, { meta: { ...activeDraft.meta, dish_name: e.target.value } })} />
                    </div>
                    <div>
                      <label className="ui24-label">编码</label>
                      <input className="ui24-input" value={activeDraft.meta.dish_code} onChange={(e) => patchImportedRecipe(activeDraftIndex, { meta: { ...activeDraft.meta, dish_code: e.target.value } })} />
                    </div>
                  </div>
                  <div className="ui24-grid-2" style={{ marginTop: 8 }}>
                    <div>
                      <label className="ui24-label">业务分类（自动推断）</label>
                      <div className="ui24-stat" style={{ minHeight: 72 }}>
                        <div style={{ color: "#fff", fontSize: 20, fontWeight: 800 }}>{activeDraft.meta.recipe_type}</div>
                        <div className="ui24-muted" style={{ marginTop: 4 }}>后续会改成默认隐藏，仅在高级设置中允许人工改。</div>
                      </div>
                    </div>
                    <div>
                      <label className="ui24-label">菜单周期（MENU 审批前必填）</label>
                      <input
                        className="ui24-input"
                        value={activeDraft.meta.menu_cycle || ""}
                        disabled={activeDraft.meta.recipe_type !== "MENU"}
                        onChange={(e) => patchImportedRecipe(activeDraftIndex, { meta: { ...activeDraft.meta, menu_cycle: e.target.value || null } })}
                      />
                    </div>
                  </div>
                  <div className="ui24-grid-2" style={{ marginTop: 8 }}>
                    <div className="ui24-stat">
                      <div className="ui24-muted">原料数</div>
                      <div style={{ color: "#fff", fontSize: 24, fontWeight: 800 }}>{activeDraft.ingredients.length}</div>
                    </div>
                    <div className="ui24-stat">
                      <div className="ui24-muted">步骤数</div>
                      <div style={{ color: "#fff", fontSize: 24, fontWeight: 800 }}>{activeDraft.steps.length}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label className="ui24-label">过敏源库</label>
                    <div className="ui24-taggrid">
                      {ALLERGEN_LIBRARY.map((item) => {
                        const active = activeDraft.allergens.includes(item);
                        return (
                          <button
                            key={`allergen-${item}`}
                            type="button"
                            className={`ui24-chip ${active ? "ui24-chip-active" : ""}`}
                            onClick={() => toggleRecipeTag(activeDraftIndex, "allergens", item)}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label className="ui24-label">饮食限制库</label>
                    <div className="ui24-taggrid">
                      {DIET_PROFILE_LIBRARY.map((item) => {
                        const active = (activeDraft.diet_flags || []).includes(item);
                        return (
                          <button
                            key={`diet-${item}`}
                            type="button"
                            className={`ui24-chip ${active ? "ui24-chip-active" : ""}`}
                            onClick={() => toggleRecipeTag(activeDraftIndex, "diet_flags", item)}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                    <div className="ui24-muted" style={{ marginTop: 6 }}>
                      当前仅做前端预览，后续会拆成独立的 diet profile 库并接 FOH 检查。
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label className="ui24-label">原料（只编辑当前草稿）</label>
                    {activeDraft.ingredients.map((ing, ingIdx) => (
                      <div key={`ing-${activeDraftIndex}-${ingIdx}`} className="ui24-grid-3" style={{ marginBottom: 6 }}>
                        <input
                          className="ui24-input"
                          placeholder="原料名"
                          value={ing.name}
                          onChange={(e) => {
                            setImportRecipes((prev) => prev.map((r, i) => i === activeDraftIndex ? {
                              ...r,
                              ingredients: r.ingredients.map((g, j) => j === ingIdx ? { ...g, name: e.target.value } : g)
                            } : r));
                          }}
                        />
                        <input
                          className="ui24-input"
                          placeholder="数量"
                          value={ing.quantity}
                          onChange={(e) => {
                            setImportRecipes((prev) => prev.map((r, i) => i === activeDraftIndex ? {
                              ...r,
                              ingredients: r.ingredients.map((g, j) => j === ingIdx ? { ...g, quantity: e.target.value } : g)
                            } : r));
                          }}
                        />
                        <div className="row">
                          <select
                            className="ui24-select"
                            value={ing.unit}
                            onChange={(e) => {
                              setImportRecipes((prev) => prev.map((r, i) => i === activeDraftIndex ? {
                                ...r,
                                ingredients: r.ingredients.map((g, j) => j === ingIdx ? { ...g, unit: e.target.value } : g)
                              } : r));
                            }}
                          >
                            {getUnitChoices(ing.unit).map((unitName) => (
                              <option key={`unit-${activeDraftIndex}-${ingIdx}-${unitName}`} value={unitName}>{unitName}</option>
                            ))}
                          </select>
                          <button
                            className="ui24-btn ui24-btn-ghost"
                            type="button"
                            onClick={() => {
                              setImportRecipes((prev) => prev.map((r, i) => {
                                if (i !== activeDraftIndex) return r;
                                const next = r.ingredients.filter((_, j) => j !== ingIdx);
                                return { ...r, ingredients: next.length > 0 ? next : [{ name: "", quantity: "", unit: "", note: "" }] };
                              }));
                            }}
                          >
                            删
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      className="ui24-btn ui24-btn-ghost"
                      type="button"
                      onClick={() => {
                        setImportRecipes((prev) => prev.map((r, i) => i === activeDraftIndex ? {
                          ...r,
                          ingredients: [...r.ingredients, { name: "", quantity: "", unit: "", note: "" }]
                        } : r));
                      }}
                    >
                      + 添加原料
                    </button>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label className="ui24-label">步骤（只编辑当前草稿）</label>
                    {activeDraft.steps.map((step, stepIdx) => (
                      <div key={`step-${activeDraftIndex}-${stepIdx}`} className="ui24-stepcard">
                        <div className="ui24-stepbar">
                          <div className="ui24-stepbadge">步骤 {stepIdx + 1}</div>
                          <div className="ui24-stepcontrols">
                            <input
                              className="ui24-input"
                              style={{ width: 72 }}
                              placeholder="序号"
                              value={String(step.step_no)}
                              onChange={(e) => {
                                const n = Number(e.target.value || 0) || stepIdx + 1;
                                setImportRecipes((prev) => prev.map((r, i) => i === activeDraftIndex ? {
                                  ...r,
                                  steps: r.steps.map((s, j) => j === stepIdx ? { ...s, step_no: n } : s)
                                } : r));
                              }}
                            />
                            <input
                              className="ui24-input"
                              style={{ width: 120 }}
                              placeholder="时长秒(可空)"
                              value={step.time_sec > 0 ? String(step.time_sec) : ""}
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                const n = raw ? Number(raw) : 0;
                                setImportRecipes((prev) => prev.map((r, i) => i === activeDraftIndex ? {
                                  ...r,
                                  steps: r.steps.map((s, j) => j === stepIdx ? { ...s, time_sec: Number.isFinite(n) ? n : 0 } : s)
                                } : r));
                              }}
                            />
                            <button
                              className="ui24-btn ui24-btn-ghost"
                              type="button"
                              onClick={() => {
                                setImportRecipes((prev) => prev.map((r, i) => {
                                  if (i !== activeDraftIndex) return r;
                                  const next = r.steps.filter((_, j) => j !== stepIdx);
                                  return { ...r, steps: next.length > 0 ? next : [{ step_no: 1, action: "", time_sec: 0 }] };
                                }));
                              }}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                        <textarea
                          className="ui24-textarea"
                          style={{ minHeight: 64 }}
                          placeholder="步骤动作"
                          value={step.action}
                          onChange={(e) => {
                            setImportRecipes((prev) => prev.map((r, i) => i === activeDraftIndex ? {
                              ...r,
                              steps: r.steps.map((s, j) => j === stepIdx ? { ...s, action: e.target.value } : s)
                            } : r));
                          }}
                        />
                      </div>
                    ))}
                    <button
                      className="ui24-btn ui24-btn-ghost"
                      type="button"
                      onClick={() => {
                        setImportRecipes((prev) => prev.map((r, i) => i === activeDraftIndex ? {
                          ...r,
                          steps: [...r.steps, { step_no: r.steps.length + 1, action: "", time_sec: 0 }]
                        } : r));
                      }}
                    >
                      + 添加步骤
                    </button>
                  </div>
                </div>
              )}
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
                  setActiveDraftIndex(0);
                  setReviewConfirmed(false);
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
                {isEphemeralStore ? "当前环境不允许入库" : "确认创建草稿"}
              </button>
            </div>
            {confirmBlockedReason && (
              <div className="ui24-muted" style={{ marginTop: 8 }}>
                {confirmBlockedReason}
              </div>
            )}
          </section>
        )}

        <section className="ui24-card">
          <h2 style={{ marginBottom: 10 }}>食谱列表</h2>
          <div className="row" style={{ marginBottom: 10 }}>
            <select className="ui24-select" value={recipeFilter} onChange={(e) => setRecipeFilter(e.target.value as "ALL" | "MENU" | "BACKBONE")} style={{ maxWidth: 200 }}>
              <option value="ALL">全部</option>
              <option value="MENU">MENU</option>
              <option value="BACKBONE">BACKBONE</option>
            </select>
            <button className="ui24-btn ui24-btn-ghost" type="button" onClick={loadRecipes}>刷新列表</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="ui24-table">
              <thead>
                <tr>
                  <th>编码</th>
                  <th>名称</th>
                  <th>类型</th>
                  <th>菜单周期</th>
                  <th>版本</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecipes.map((recipe) => (
                  <tr key={recipe.id}>
                    <td>{recipe.code}</td>
                    <td>{recipe.name}</td>
                    <td>{recipe.recipe_type}</td>
                    <td>{recipe.menu_cycle || "-"}</td>
                    <td>{recipe.active_version_no ? `v${recipe.active_version_no}` : "-"}</td>
                    <td>{recipe.active_status || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
