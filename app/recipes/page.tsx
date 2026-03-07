"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import type { RecipeSummary, RecipeUser } from "@/lib/types";

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
  ingredients: Array<{ name: string; quantity: string; unit: string; note?: string }>;
  steps: Array<{ step_no: number; action: string; time_sec: number; temp_c?: number; note?: string }>;
};

type ImportReview = {
  needs_manual_review: boolean;
  reasons: string[];
  detected_components_count: number;
  detected_recipe_count: number;
};

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
  const [selectedUser, setSelectedUser] = useState("");
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [recipeFilter, setRecipeFilter] = useState<"ALL" | "MENU" | "BACKBONE">("ALL");

  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importWarnings, setImportWarnings] = useState<Array<{ index: number; field: string; message: string }>>([]);
  const [importRecipes, setImportRecipes] = useState<ImportedRecipe[]>([]);
  const [importReview, setImportReview] = useState<ImportReview | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importNotice, setImportNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null);
  const [lastUploadName, setLastUploadName] = useState("");
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

  async function loadRecipes() {
    const res = await fetch(`${apiBase}/api/recipes`);
    const json = await res.json();
    setRecipes((json.data || []) as RecipeSummary[]);
  }

  useEffect(() => {
    loadUsers();
    loadRecipes();
  }, []);

  const filteredRecipes = useMemo(() => {
    if (recipeFilter === "ALL") return recipes;
    return recipes.filter((item) => item.recipe_type === recipeFilter);
  }, [recipeFilter, recipes]);

  function patchImportedRecipe(index: number, patch: Partial<ImportedRecipe>) {
    setImportRecipes((prev) => prev.map((item, idx) => idx === index ? { ...item, ...patch } : item));
  }

  async function parseByText() {
    const content = importText.trim();
    if (!content) {
      alert("请先输入或粘贴食谱内容");
      return;
    }
    if (!activeActorEmail) {
      setImportNotice({ type: "error", text: "操作人未就绪，请刷新页面后重试。" });
      return;
    }
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
        setImportNotice({ type: "error", text: `解析失败: ${json.message || json.error || "UNKNOWN_ERROR"}` });
        return;
      }
      const parsed = (json.recipes || []).map(normalizeImportedRecipe);
      setImportRecipes(parsed);
      setImportWarnings(json.warnings || []);
      setImportReview(json.review || null);
      setReviewConfirmed(false);
      if (parsed.length > 0) {
        setImportNotice({ type: "success", text: `解析成功：识别到 ${parsed.length} 个食谱。` });
      } else {
        setImportNotice({ type: "info", text: "解析完成，但没有识别到可导入食谱。请检查文本格式。" });
      }
    } finally {
      setImportLoading(false);
    }
  }

  async function parseByFile(file: File) {
    if (!activeActorEmail) {
      setImportNotice({ type: "error", text: "操作人未就绪，请刷新页面后重试。" });
      return;
    }
    setLastUploadName(file.name);
    setImportNotice({ type: "info", text: `已上传 ${file.name}，正在解析...` });
    setImportLoading(true);
    try {
      const nameLower = file.name.toLowerCase();
      const isImage = file.type.startsWith("image/");
      const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || nameLower.endsWith(".docx");
      const isCsv = file.type === "text/csv" || nameLower.endsWith(".csv");
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
        setImportNotice({ type: "error", text: `解析失败: ${json.message || json.error || "UNKNOWN_ERROR"}` });
        return;
      }
      const parsed = (json.recipes || []).map(normalizeImportedRecipe);
      setImportRecipes(parsed);
      setImportWarnings(json.warnings || []);
      setImportReview(json.review || null);
      setReviewConfirmed(false);
      if (parsed.length > 0) {
        setImportNotice({ type: "success", text: `解析成功：识别到 ${parsed.length} 个食谱。` });
      } else {
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
        ingredients: recipe.ingredients,
        steps: recipe.steps
      }));
      const res = await fetch(`${apiBase}/api/recipes/import/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_items: draftItems, actor_email: activeActorEmail })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`创建失败: ${json.error || "UNKNOWN_ERROR"}`);
        return;
      }
      alert(`成功创建 ${json.created?.length || 0} 个草稿`);
      setImportRecipes([]);
      setImportWarnings([]);
      setImportText("");
      setLastUploadName("");
      setImportReview(null);
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
          {importNotice && (
            <div
              style={{
                marginBottom: 10,
                borderRadius: 10,
                border: `1px solid ${importNotice.type === "error" ? "#7f1d1d" : importNotice.type === "success" ? "#14532d" : "#374151"}`,
                background: importNotice.type === "error" ? "#2a1111" : importNotice.type === "success" ? "#102417" : "#1f2937",
                padding: "10px 12px",
                color: "#fff"
              }}
            >
              {importNotice.text}
            </div>
          )}
          {importReview?.needs_manual_review && (
            <div
              style={{
                marginBottom: 10,
                borderRadius: 10,
                border: "1px solid #7c2d12",
                background: "#2b1a12",
                padding: "10px 12px",
                color: "#fff"
              }}
            >
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

        {importRecipes.length > 0 && (
          <section className="ui24-card" style={{ marginBottom: 14 }}>
            <h2 style={{ marginBottom: 10 }}>AI 提取列表（人工审核后入库）</h2>
            {importRecipes.map((recipe, idx) => (
              <div key={`import-${idx}`} className="ui24-card" style={{ marginTop: 10, background: "#1f1f1f" }}>
                {getImportedRecipeAutoTag(recipe) && (
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
                      color: getImportedRecipeAutoTag(recipe)?.color,
                      background: getImportedRecipeAutoTag(recipe)?.bg,
                      border: `1px solid ${getImportedRecipeAutoTag(recipe)?.color}`
                    }}
                  >
                    {getImportedRecipeAutoTag(recipe)?.label}
                  </div>
                )}
                <div className="ui24-grid-2">
                  <div>
                    <label className="ui24-label">菜名</label>
                    <input className="ui24-input" value={recipe.meta.dish_name} onChange={(e) => patchImportedRecipe(idx, { meta: { ...recipe.meta, dish_name: e.target.value } })} />
                  </div>
                  <div>
                    <label className="ui24-label">编码</label>
                    <input className="ui24-input" value={recipe.meta.dish_code} onChange={(e) => patchImportedRecipe(idx, { meta: { ...recipe.meta, dish_code: e.target.value } })} />
                  </div>
                </div>
                <div className="ui24-grid-2" style={{ marginTop: 8 }}>
                  <div>
                    <label className="ui24-label">类型</label>
                    <select
                      className="ui24-select"
                      value={recipe.meta.recipe_type}
                      onChange={(e) => patchImportedRecipe(idx, {
                        meta: {
                          ...recipe.meta,
                          recipe_type: e.target.value as "MENU" | "BACKBONE",
                          menu_cycle: e.target.value === "BACKBONE" ? null : recipe.meta.menu_cycle
                        }
                      })}
                    >
                      <option value="MENU">MENU</option>
                      <option value="BACKBONE">BACKBONE</option>
                    </select>
                  </div>
                  <div>
                    <label className="ui24-label">菜单周期（MENU 审批前必填）</label>
                    <input
                      className="ui24-input"
                      value={recipe.meta.menu_cycle || ""}
                      disabled={recipe.meta.recipe_type !== "MENU"}
                      onChange={(e) => patchImportedRecipe(idx, { meta: { ...recipe.meta, menu_cycle: e.target.value || null } })}
                    />
                  </div>
                </div>
                <p className="ui24-muted" style={{ marginTop: 8 }}>
                  原料 {recipe.ingredients.length} 项，步骤 {recipe.steps.length} 项，过敏原 {recipe.allergens.length} 项
                </p>
                <div style={{ marginTop: 8 }}>
                  <label className="ui24-label">过敏原（逗号分隔）</label>
                  <input
                    className="ui24-input"
                    value={recipe.allergens.join(", ")}
                    onChange={(e) => {
                      const allergens = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                      setImportRecipes((prev) => prev.map((r, i) => i === idx ? { ...r, allergens } : r));
                    }}
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <label className="ui24-label">原料（可编辑）</label>
                  {recipe.ingredients.map((ing, ingIdx) => (
                    <div key={`ing-${idx}-${ingIdx}`} className="ui24-grid-3" style={{ marginBottom: 6 }}>
                      <input
                        className="ui24-input"
                        placeholder="原料名"
                        value={ing.name}
                        onChange={(e) => {
                          setImportRecipes((prev) => prev.map((r, i) => i === idx ? {
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
                          setImportRecipes((prev) => prev.map((r, i) => i === idx ? {
                            ...r,
                            ingredients: r.ingredients.map((g, j) => j === ingIdx ? { ...g, quantity: e.target.value } : g)
                          } : r));
                        }}
                      />
                      <div className="row">
                        <input
                          className="ui24-input"
                          placeholder="单位"
                          value={ing.unit}
                          onChange={(e) => {
                            setImportRecipes((prev) => prev.map((r, i) => i === idx ? {
                              ...r,
                              ingredients: r.ingredients.map((g, j) => j === ingIdx ? { ...g, unit: e.target.value } : g)
                            } : r));
                          }}
                        />
                        <button
                          className="ui24-btn ui24-btn-ghost"
                          type="button"
                          onClick={() => {
                            setImportRecipes((prev) => prev.map((r, i) => {
                              if (i !== idx) return r;
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
                      setImportRecipes((prev) => prev.map((r, i) => i === idx ? {
                        ...r,
                        ingredients: [...r.ingredients, { name: "", quantity: "", unit: "", note: "" }]
                      } : r));
                    }}
                  >
                    + 添加原料
                  </button>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label className="ui24-label">步骤（可编辑）</label>
                  {recipe.steps.map((step, stepIdx) => (
                    <div key={`step-${idx}-${stepIdx}`} className="ui24-grid-3" style={{ marginBottom: 6 }}>
                      <input
                        className="ui24-input"
                        placeholder="步骤序号"
                        value={String(step.step_no)}
                        onChange={(e) => {
                          const n = Number(e.target.value || 0) || stepIdx + 1;
                          setImportRecipes((prev) => prev.map((r, i) => i === idx ? {
                            ...r,
                            steps: r.steps.map((s, j) => j === stepIdx ? { ...s, step_no: n } : s)
                          } : r));
                        }}
                      />
                      <input
                        className="ui24-input"
                        placeholder="动作"
                        value={step.action}
                        onChange={(e) => {
                          setImportRecipes((prev) => prev.map((r, i) => i === idx ? {
                            ...r,
                            steps: r.steps.map((s, j) => j === stepIdx ? { ...s, action: e.target.value } : s)
                          } : r));
                        }}
                      />
                      <div className="row">
                        <input
                          className="ui24-input"
                          placeholder="时长秒"
                          value={String(step.time_sec)}
                          onChange={(e) => {
                            const n = Number(e.target.value || 0);
                            setImportRecipes((prev) => prev.map((r, i) => i === idx ? {
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
                              if (i !== idx) return r;
                              const next = r.steps.filter((_, j) => j !== stepIdx);
                              return { ...r, steps: next.length > 0 ? next : [{ step_no: 1, action: "", time_sec: 0 }] };
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
                      setImportRecipes((prev) => prev.map((r, i) => i === idx ? {
                        ...r,
                        steps: [...r.steps, { step_no: r.steps.length + 1, action: "", time_sec: 0 }]
                      } : r));
                    }}
                  >
                    + 添加步骤
                  </button>
                </div>
              </div>
            ))}
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="ui24-btn ui24-btn-ghost"
                type="button"
                onClick={() => {
                  setImportRecipes([]);
                  setImportWarnings([]);
                  setImportReview(null);
                  setReviewConfirmed(false);
                }}
              >
                清空结果
              </button>
              <button
                className="ui24-btn"
                type="button"
                onClick={confirmImport}
                disabled={importLoading || Boolean(importReview?.needs_manual_review && !reviewConfirmed)}
              >
                确认创建草稿
              </button>
            </div>
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
