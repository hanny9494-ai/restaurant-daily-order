"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import RecipeWorkbenchShell from "@/components/RecipeWorkbenchShell";
import type { RecipeDetail, RecipeSummary, RecipeUser, RecipeVersion } from "@/lib/types";

type RecipeRecordJson = {
  meta: {
    dish_code: string;
    dish_name: string;
    display_name?: string;
    aliases?: string[];
    entity_kind: "ELEMENT";
    business_type: "MENU" | "BACKBONE";
    technique_family?: string;
    menu_cycle: string | null;
    plating_image_url?: string;
  };
  production?: {
    yield?: string;
    net_yield_rate?: number;
  };
  allergens?: string[];
  diet_flags?: string[];
  ingredients?: Array<{ name: string; quantity: string; unit: string; note?: string }>;
  steps?: Array<{ step_id?: string; step_no: number; action: string; time_sec: number; temp_c?: number }>;
};

type CompositeRecordJson = {
  meta: {
    dish_code: string;
    dish_name: string;
    display_name?: string;
    aliases?: string[];
    entity_kind: "COMPOSITE";
    business_type: "MENU" | "BACKBONE";
    menu_cycle: string | null;
  };
  assembly_components: Array<{
    component_kind: string;
    child_code?: string;
    ref_name: string;
    component_role?: string;
    section?: string;
    sort_order?: number;
    quantity?: string;
    unit?: string;
    is_optional?: boolean;
    source_ref?: string;
    prep_note?: string;
  }>;
  assembly_steps: Array<{
    step_id?: string;
    step_no: number;
    action: string;
  }>;
};

function parseVersionRecord(version: RecipeVersion) {
  if (!version.recipe_record_json) return null;
  try {
    return JSON.parse(version.recipe_record_json) as Record<string, any>;
  } catch {
    return null;
  }
}

function isCompositeRecord(record: unknown): record is CompositeRecordJson {
  return Boolean(
    record &&
    typeof record === "object" &&
    (record as any)?.meta?.entity_kind === "COMPOSITE" &&
    Array.isArray((record as any)?.assembly_components)
  );
}

function buildElementRecord(detail: RecipeDetail, version: RecipeVersion): RecipeRecordJson {
  const raw = parseVersionRecord(version) as RecipeRecordJson | null;
  if (raw?.meta?.entity_kind === "ELEMENT") return raw;
  const lines = String(version.instructions || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    meta: {
      dish_code: detail.code,
      dish_name: detail.name,
      display_name: detail.name,
      aliases: [],
      entity_kind: "ELEMENT",
      business_type: detail.business_type,
      technique_family: detail.technique_family || "OTHER",
      menu_cycle: detail.menu_cycle,
      plating_image_url: ""
    },
    production: {
      yield: version.yield || version.servings || ""
    },
    allergens: [],
    diet_flags: [],
    ingredients: (version.ingredients || []).map((it) => ({
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      note: it.note || ""
    })),
    steps: lines.map((line, idx) => ({
      step_id: `step_${String(idx + 1).padStart(3, "0")}`,
      step_no: idx + 1,
      action: line.replace(/^\d+[\.)]\s*/, ""),
      time_sec: 0
    }))
  };
}

function buildCompositeRecord(detail: RecipeDetail, version: RecipeVersion): CompositeRecordJson {
  const raw = parseVersionRecord(version);
  if (isCompositeRecord(raw)) return raw;
  const lines = String(version.instructions || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    meta: {
      dish_code: detail.code,
      dish_name: detail.name,
      display_name: detail.name,
      aliases: [],
      entity_kind: "COMPOSITE",
      business_type: detail.business_type,
      menu_cycle: detail.menu_cycle
    },
    assembly_components: (version.components || []).map((component) => ({
      component_kind: component.component_kind,
      child_code: undefined,
      ref_name: component.display_name,
      component_role: component.component_role || undefined,
      section: component.section,
      sort_order: component.sort_order,
      quantity: component.quantity || undefined,
      unit: component.unit || undefined,
      is_optional: Boolean(component.is_optional),
      source_ref: component.source_ref || undefined,
      prep_note: component.prep_note || undefined
    })),
    assembly_steps: lines.map((line, idx) => ({
      step_id: `assembly_${String(idx + 1).padStart(3, "0")}`,
      step_no: idx + 1,
      action: line.replace(/^\d+[\.)]\s*/, "")
    }))
  };
}

const dishButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid #2f2f2f",
  background: "#171717",
  color: "#fff",
  cursor: "pointer"
};

function RecipeViewPageInner() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [users, setUsers] = useState<RecipeUser[]>([]);
  const [runtimeMode, setRuntimeMode] = useState<"persistent" | "ephemeral">("ephemeral");
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [menuCycleFilter, setMenuCycleFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [requestedRecipeId, setRequestedRecipeId] = useState<number>(0);
  const [requestedVersionId, setRequestedVersionId] = useState<number>(0);
  const [requestedParentRecipeId, setRequestedParentRecipeId] = useState<number>(0);

  const compositeRecipes = useMemo(
    () => recipes.filter((recipe) => recipe.entity_kind === "COMPOSITE"),
    [recipes]
  );

  const menuCycles = useMemo(() => {
    return Array.from(new Set(compositeRecipes.map((recipe) => recipe.menu_cycle || "未设置菜单周期")));
  }, [compositeRecipes]);

  const unifiedSearchResults = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return [] as Array<{ kind: "COMPOSITE" | "ELEMENT"; recipe: RecipeSummary }>;
    return recipes
      .filter((recipe) => {
        if (menuCycleFilter) {
          const cycle = recipe.menu_cycle || "未设置菜单周期";
          if (cycle !== menuCycleFilter) return false;
        }
        return recipe.name.toLowerCase().includes(keyword) || recipe.code.toLowerCase().includes(keyword);
      })
      .map((recipe) => ({
        kind: recipe.entity_kind,
        recipe
      }))
      .slice(0, 24);
  }, [menuCycleFilter, recipes, searchQuery]);

  const cycleCompositeRecipes = useMemo(() => {
    if (!menuCycleFilter) return [];
    return compositeRecipes.filter((recipe) => {
      const cycle = recipe.menu_cycle || "未设置菜单周期";
      return cycle === menuCycleFilter;
    });
  }, [compositeRecipes, menuCycleFilter]);

  const selectedVersion = useMemo(() => {
    if (!detail || !selectedVersionId) return null;
    return detail.versions.find((version) => version.id === selectedVersionId) || null;
  }, [detail, selectedVersionId]);

  const compositeRecord = useMemo(() => {
    if (!detail || !selectedVersion || detail.entity_kind !== "COMPOSITE") return null;
    return buildCompositeRecord(detail, selectedVersion);
  }, [detail, selectedVersion]);

  const elementRecord = useMemo(() => {
    if (!detail || !selectedVersion || detail.entity_kind !== "ELEMENT") return null;
    return buildElementRecord(detail, selectedVersion);
  }, [detail, selectedVersion]);
  const actorEmail = users.find((user) => user.role === "OWNER" || user.role === "EDITOR")?.email || "owner@restaurant.local";

  function resolveLinkedRecipeId(component: CompositeRecordJson["assembly_components"][number], index: number) {
    const direct = selectedVersion?.components?.[index]?.child_recipe_id || 0;
    if (direct > 0) return direct;
    const matchedVersionComponent = (selectedVersion?.components || []).find((item) => {
      const byName = item.display_name === component.ref_name;
      const byCode = component.child_code ? item.display_name === component.child_code : false;
      return byName || byCode;
    });
    if (matchedVersionComponent?.child_recipe_id) return Number(matchedVersionComponent.child_recipe_id);
    const matchedRecipe = recipes.find((recipe) => {
      if (recipe.entity_kind !== "ELEMENT") return false;
      if (component.child_code && recipe.code === component.child_code) return true;
      return recipe.name === component.ref_name;
    });
    return matchedRecipe?.id || 0;
  }

  async function loadUsers() {
    try {
      const res = await fetch(`${apiBase}/api/recipe-users`);
      const json = await res.json();
      setUsers((json.data || []) as RecipeUser[]);
    } catch {
      setUsers([]);
    }
  }

  async function loadRecipes() {
    const res = await fetch(`${apiBase}/api/recipes`);
    const json = await res.json();
    const data = (json.data || []) as RecipeSummary[];
    setRecipes(data);
    if (requestedRecipeId > 0 && data.some((item) => item.id === requestedRecipeId)) {
      const requestedRecipe = data.find((item) => item.id === requestedRecipeId) || null;
      if (requestedRecipe) {
        setMenuCycleFilter(requestedRecipe.menu_cycle || "");
      }
      setSelectedRecipeId(requestedRecipeId);
      return;
    }
  }

  async function loadDetail(recipeId: number, preferVersionId?: number) {
    const res = await fetch(`${apiBase}/api/recipes/${recipeId}`);
    if (!res.ok) return;
    const json = await res.json();
    const data = json.data as RecipeDetail;
    setDetail(data);
    if (data.versions.length > 0) {
      const preferred = [preferVersionId, requestedVersionId, selectedVersionId]
        .map((value) => Number(value || 0))
        .find((candidate) => candidate > 0 && data.versions.some((version) => version.id === candidate));
      setSelectedVersionId(preferred || data.versions[0].id);
    } else {
      setSelectedVersionId(null);
    }
  }

  useEffect(() => {
    setRequestedRecipeId(Number(searchParams.get("recipeId") || 0));
    setRequestedVersionId(Number(searchParams.get("versionId") || 0));
    setRequestedParentRecipeId(Number(searchParams.get("parentRecipeId") || 0));
  }, [searchParams]);

  useEffect(() => {
    loadRecipes();
    loadUsers();
    fetch(`${apiBase}/api/runtime/status`)
      .then((res) => res.json())
      .then((json) => setRuntimeMode(json.data?.recipe_store?.mode === "persistent" ? "persistent" : "ephemeral"))
      .catch(() => setRuntimeMode("ephemeral"));
  }, [requestedRecipeId, apiBase]);

  useEffect(() => {
    if (selectedRecipeId) loadDetail(selectedRecipeId);
  }, [selectedRecipeId]);

  useEffect(() => {
    if (!selectedRecipeId) return;
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("recipeId", String(selectedRecipeId));
    if (selectedVersionId) params.set("versionId", String(selectedVersionId));
    else params.delete("versionId");
    router.replace(`/recipes/view?${params.toString()}`);
  }, [selectedRecipeId, selectedVersionId, router]);

  useEffect(() => {
    const searchedCompositeRecipes = unifiedSearchResults
      .filter((item) => item.kind === "COMPOSITE")
      .map((item) => item.recipe);
    const candidateRecipes = searchedCompositeRecipes.length > 0
      ? searchedCompositeRecipes
      : cycleCompositeRecipes;
    if (candidateRecipes.length < 1) return;
    if (!selectedRecipeId && menuCycleFilter && !searchQuery.trim()) {
      setSelectedRecipeId(candidateRecipes[0].id);
      return;
    }
    const existsAnywhere = recipes.some((recipe) => recipe.id === selectedRecipeId);
    if (!existsAnywhere) {
      setSelectedRecipeId(candidateRecipes[0].id);
    }
  }, [cycleCompositeRecipes, menuCycleFilter, recipes, requestedRecipeId, searchQuery, selectedRecipeId, unifiedSearchResults]);

  async function deleteCurrentRecipe() {
    if (!detail) return;
    const confirmed = window.confirm(`删除 ${detail.name}？`);
    if (!confirmed) return;
    const res = await fetch(`${apiBase}/api/recipes/${detail.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: actorEmail })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(`删除失败: ${json.error || "UNKNOWN_ERROR"}`);
      return;
    }
    setDetail(null);
    setSelectedRecipeId(null);
    setSelectedVersionId(null);
    await loadRecipes();
  }

  return (
    <RecipeWorkbenchShell
      current="view"
      title="查看菜谱"
      description="给厨房用。这里只看菜式、组成和动作。"
    >
      <section className="ui24-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="ui24-recipe-view-shell">
          <aside className="ui24-recipe-view-aside">
            <div style={{ padding: 16, borderBottom: "1px solid #2f2f2f" }}>
              <div className="field" style={{ marginBottom: 10 }}>
                <label className="ui24-label">菜单周期</label>
                <select className="ui24-select" value={menuCycleFilter} onChange={(e) => setMenuCycleFilter(e.target.value)}>
                  <option value="">先选菜单周期</option>
                  {menuCycles.map((cycle) => (
                    <option key={cycle} value={cycle}>{cycle}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label className="ui24-label">统一搜索</label>
                <input className="ui24-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜菜式或子配方" />
              </div>
            </div>
            <div style={{ padding: 16, display: "grid", gap: 10, maxHeight: 620, overflow: "auto" }}>
              {searchQuery.trim() ? (
                <>
                  <div className="ui24-muted" style={{ marginBottom: 2 }}>搜索结果</div>
                  {unifiedSearchResults.length > 0 ? unifiedSearchResults.map(({ kind, recipe }) => (
                    <button
                      key={`${kind}-${recipe.id}`}
                      type="button"
                      onClick={() => setSelectedRecipeId(recipe.id)}
                      style={{
                        ...dishButtonStyle,
                        background: selectedRecipeId === recipe.id ? "#1f2937" : "#171717",
                        borderColor: selectedRecipeId === recipe.id ? "#2563eb" : "#2f2f2f"
                      }}
                    >
                      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{recipe.name}</div>
                      <div className="ui24-muted">
                        {kind === "COMPOSITE" ? "菜式" : "子配方"}{recipe.menu_cycle ? ` / ${recipe.menu_cycle}` : ""}
                      </div>
                    </button>
                  )) : <div className="ui24-muted">没有匹配结果。</div>}
                </>
              ) : null}

              {menuCycleFilter ? (
                <>
                  <div className="ui24-muted" style={{ marginBottom: 2 }}>
                    当期菜单
                  </div>
                  {cycleCompositeRecipes.map((recipe) => (
                    <button
                      key={`cycle-${recipe.id}`}
                      type="button"
                      onClick={() => setSelectedRecipeId(recipe.id)}
                      style={{
                        ...dishButtonStyle,
                        background: selectedRecipeId === recipe.id ? "#1f2937" : "#171717",
                        borderColor: selectedRecipeId === recipe.id ? "#2563eb" : "#2f2f2f"
                      }}
                    >
                      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{recipe.name}</div>
                      <div className="ui24-muted">
                        周期菜单 / {recipe.menu_cycle || "未设置菜单周期"}
                      </div>
                    </button>
                  ))}
                  {cycleCompositeRecipes.length < 1 && <div className="ui24-muted">这个周期下还没有菜式。</div>}
                </>
              ) : (
                <div className="ui24-muted">可先选菜单周期看当期菜单，也可以直接搜索菜式或子配方。</div>
              )}

            </div>
          </aside>

          <div className="ui24-recipe-view-main">
            {!detail || !selectedVersion ? (
              <p className="ui24-muted">先从左边点一道菜。</p>
            ) : detail.entity_kind === "COMPOSITE" && compositeRecord ? (
              <>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <h2 style={{ marginBottom: 4 }}>{detail.name}</h2>
                    <div className="ui24-muted">{detail.menu_cycle || "未设置菜单周期"}</div>
                  </div>
                  <div className="row">
                    <select className="ui24-select" value={selectedVersionId || ""} onChange={(e) => setSelectedVersionId(Number(e.target.value))} style={{ maxWidth: 180 }}>
                      {detail.versions.map((version) => (
                        <option key={version.id} value={version.id}>v{version.version_no}</option>
                      ))}
                    </select>
                    <Link className="ui24-btn" href={`/recipes?mode=compose&recipeId=${detail.id}${selectedVersionId ? `&versionId=${selectedVersionId}` : ""}`}>
                      去组装
                    </Link>
                    {runtimeMode === "persistent" && (
                      <button className="ui24-btn ui24-btn-danger" type="button" onClick={deleteCurrentRecipe}>
                        删除
                      </button>
                    )}
                  </div>
                </div>

                <section className="ui24-card" style={{ marginBottom: 16, background: "#171717" }}>
                  <h3 style={{ marginBottom: 10 }}>配方组成</h3>
                  <div style={{ display: "grid", gap: 10 }}>
                    {compositeRecord.assembly_components.map((component, idx) => {
                      const linkedId = resolveLinkedRecipeId(component, idx);
                      const name = component.ref_name;
                      const extra = [component.quantity, component.unit].filter(Boolean).join(" ");
                      return (
                        linkedId ? (
                          <Link
                            key={`${name}-${idx}`}
                            href={`/recipes/view?recipeId=${linkedId}&parentRecipeId=${detail.id}`}
                            className="ui24-listitem"
                            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none" }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, color: "#fff" }}>{name}</div>
                              {extra ? <div className="ui24-muted">{extra}</div> : null}
                            </div>
                            <div className="ui24-muted">详细配方</div>
                          </Link>
                        ) : (
                          <div key={`${name}-${idx}`} className="ui24-listitem" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontWeight: 700, color: "#fff" }}>{name}</div>
                              {extra ? <div className="ui24-muted">{extra}</div> : null}
                            </div>
                          </div>
                        )
                      );
                    })}
                  </div>
                </section>

                <section className="ui24-card" style={{ background: "#171717" }}>
                  <h3 style={{ marginBottom: 10 }}>出品动作</h3>
                  <div style={{ display: "grid", gap: 10 }}>
                    {compositeRecord.assembly_steps.map((step) => (
                      <div key={step.step_id || step.step_no} className="ui24-stepcard">
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>步骤 {step.step_no}</div>
                        <div className="ui24-stepaction">{step.action}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : elementRecord ? (
              <>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <h2 style={{ marginBottom: 4 }}>{detail.name}</h2>
                    <div className="ui24-muted">{elementRecord.meta.technique_family || "Element"}</div>
                  </div>
                  <div className="row">
                    <Link className="ui24-btn ui24-btn-ghost" href={requestedParentRecipeId > 0 ? `/recipes/view?recipeId=${requestedParentRecipeId}` : "/recipes/view"}>返回菜式</Link>
                    {runtimeMode === "persistent" && (
                      <button className="ui24-btn ui24-btn-danger" type="button" onClick={deleteCurrentRecipe}>
                        删除
                      </button>
                    )}
                  </div>
                </div>

                <section className="ui24-card" style={{ marginBottom: 16, background: "#171717" }}>
                  <h3 style={{ marginBottom: 10 }}>原料</h3>
                  <div style={{ display: "grid", gap: 8 }}>
                    {(elementRecord.ingredients || []).map((ing, idx) => (
                      <div key={`ing-${idx}`} className="ui24-listitem" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 700, color: "#fff" }}>{ing.name}</div>
                        <div>{[ing.quantity, ing.unit].filter(Boolean).join(" ")}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="ui24-card" style={{ background: "#171717" }}>
                  <h3 style={{ marginBottom: 10 }}>制作步骤</h3>
                  <div style={{ display: "grid", gap: 10 }}>
                    {(elementRecord.steps || []).map((step) => (
                      <div key={step.step_id || step.step_no} className="ui24-stepcard">
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>步骤 {step.step_no}</div>
                        <div className="ui24-stepaction">{step.action}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </RecipeWorkbenchShell>
  );
}

export default function RecipeViewPage() {
  return (
    <Suspense fallback={null}>
      <RecipeViewPageInner />
    </Suspense>
  );
}
