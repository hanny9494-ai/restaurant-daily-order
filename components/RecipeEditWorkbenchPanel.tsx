"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import type { RecipeDetail, RecipeSummary, RecipeUser, RecipeVersion } from "@/lib/types";

type RecipeRecordJson = {
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
    key_temperature_points: Array<{
      point_id?: string;
      step: string;
      temp_c: number;
      hold_sec: number;
      note?: string;
    }>;
  };
  allergens: string[];
  diet_flags?: string[];
  ingredients: Array<{ name: string; quantity: string; unit: string; note?: string }>;
  steps: Array<{
    step_id?: string;
    step_no: number;
    action: string;
    time_sec: number;
    temp_c?: number;
    equipment?: string[];
    ccp?: string;
    note?: string;
  }>;
  component_refs?: Array<Record<string, any>>;
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

type RuntimeStatus = {
  mode: "persistent" | "ephemeral";
  provider: string;
  reason: string;
};

function buildRecord(detail: RecipeDetail, version: RecipeVersion): RecipeRecordJson {
  if (version.recipe_record_json) {
    try {
      return JSON.parse(version.recipe_record_json) as RecipeRecordJson;
    } catch {
    }
  }
  const lines = String(version.instructions || "")
    .split(/\n+/g)
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
      yield: version.yield || version.servings || "",
      net_yield_rate: 1,
      key_temperature_points: []
    },
    allergens: [],
    diet_flags: [],
    ingredients: (version.ingredients || []).map((it) => ({
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      note: it.note || ""
    })),
    steps: lines.length
      ? lines.map((line, idx) => ({ step_id: `step_${String(idx + 1).padStart(3, "0")}`, step_no: idx + 1, action: line, time_sec: 0 }))
      : [{ step_id: "step_001", step_no: 1, action: "待填写", time_sec: 0 }],
    component_refs: []
  };
}

function buildCompositeRecord(detail: RecipeDetail, version: RecipeVersion): CompositeRecordJson {
  const raw = parseVersionRecord(version);
  if (isCompositeRecord(raw)) {
    return raw;
  }
  const lines = String(version.instructions || "")
    .split(/\n+/g)
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
    assembly_steps: lines.length > 0
      ? lines.map((line, idx) => ({
          step_id: `assembly_${String(idx + 1).padStart(3, "0")}`,
          step_no: idx + 1,
          action: line.replace(/^\d+\.\s*/, "")
        }))
      : [{ step_id: "assembly_001", step_no: 1, action: "待填写整道菜 assembly 动作" }]
  };
}

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

function emptyIngredient() {
  return { name: "", quantity: "", unit: "", note: "" };
}

function emptyStep(stepNo: number) {
  return { step_no: stepNo, action: "", time_sec: 0, ccp: "", note: "" };
}

function emptyCompositeComponent(sortOrder: number) {
  return {
    component_kind: "REFERENCE_PREP",
    child_code: "",
    ref_name: "",
    component_role: "",
    section: "ASSEMBLY",
    sort_order: sortOrder,
    quantity: "",
    unit: "",
    is_optional: false,
    source_ref: "",
    prep_note: ""
  };
}

function emptyCompositeStep(stepNo: number) {
  return {
    step_id: `assembly_${String(stepNo).padStart(3, "0")}`,
    step_no: stepNo,
    action: ""
  };
}

type RecipeEditWorkbenchPanelProps = {
  elementOnly?: boolean;
};

export default function RecipeEditWorkbenchPanel({ elementOnly = false }: RecipeEditWorkbenchPanelProps) {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<RecipeUser[]>([]);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [recipeFilter, setRecipeFilter] = useState<"ALL" | "MENU" | "BACKBONE">("ALL");
  const [entityFilter, setEntityFilter] = useState<"COMPOSITE" | "ELEMENT" | "ALL">(elementOnly ? "ELEMENT" : "COMPOSITE");
  const [editMode, setEditMode] = useState(false);
  const [record, setRecord] = useState<RecipeRecordJson | null>(null);
  const [compositeDraft, setCompositeDraft] = useState<CompositeRecordJson | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [requestedRecipeId, setRequestedRecipeId] = useState<number>(0);
  const [requestedVersionId, setRequestedVersionId] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [elementDrawerPanel, setElementDrawerPanel] = useState<"meta" | "ingredients" | "steps" | null>(null);

  const currentUser = useMemo(
    () => users.find((user) => user.email === selectedUser) || null,
    [users, selectedUser]
  );
  const canEdit = currentUser?.role === "OWNER" || currentUser?.role === "EDITOR";
  const isEphemeralStore = runtimeStatus?.mode === "ephemeral";

  const selectedVersion = useMemo(() => {
    if (!detail || !selectedVersionId) return null;
    return detail.versions.find((version) => version.id === selectedVersionId) || null;
  }, [detail, selectedVersionId]);

  const filteredRecipes = useMemo(() => {
    return recipes.filter((recipe) => {
      if (recipeFilter !== "ALL" && recipe.business_type !== recipeFilter) return false;
      const effectiveEntityFilter = elementOnly ? "ELEMENT" : entityFilter;
      if (effectiveEntityFilter !== "ALL" && recipe.entity_kind !== effectiveEntityFilter) return false;
      const keyword = search.trim().toLowerCase();
      if (!keyword) return true;
      return recipe.name.toLowerCase().includes(keyword) || recipe.code.toLowerCase().includes(keyword);
    });
  }, [elementOnly, entityFilter, recipeFilter, recipes, search]);

  const recipeStats = useMemo(() => {
    const composites = recipes.filter((recipe) => recipe.entity_kind === "COMPOSITE").length;
    const elements = recipes.filter((recipe) => recipe.entity_kind === "ELEMENT").length;
    return { composites, elements, total: recipes.length };
  }, [recipes]);

  function openChildRecipe(childRecipeId: number, childVersionId?: number | null) {
    if (!childRecipeId) return;
    setSelectedRecipeId(childRecipeId);
    setSelectedVersionId(childVersionId ? Number(childVersionId) : null);
    if (elementOnly) {
      setEditMode(Boolean(canEdit));
      setElementDrawerPanel("ingredients");
    } else {
      setEditMode(false);
    }
  }

  async function loadUsers() {
    const res = await fetch(`${apiBase}/api/recipe-users`);
    const json = await res.json();
    const data = (json.data || []) as RecipeUser[];
    setUsers(data);
    if (!selectedUser && data.length > 0) {
      setSelectedUser(data[0].email);
    }
  }

  async function loadRecipes() {
    const res = await fetch(`${apiBase}/api/recipes`);
    const json = await res.json();
    const data = (json.data || []) as RecipeSummary[];
    setRecipes(data);
    if (requestedRecipeId > 0 && data.some((item) => item.id === requestedRecipeId)) {
      setSelectedRecipeId(requestedRecipeId);
      return;
    }
    if (!selectedRecipeId && data.length > 0) {
      const preferred = data.find((item) => item.entity_kind === "COMPOSITE") || data[0];
      setSelectedRecipeId(preferred.id);
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
      const v = data.versions.find((item) => item.id === preferred) || data.versions[0];
      setSelectedVersionId(v.id);
      const editable = Boolean(canEdit && (v.status === "DRAFT" || v.status === "REJECTED"));
      if (data.entity_kind === "COMPOSITE") {
        setCompositeDraft(buildCompositeRecord(data, v));
        setRecord(null);
        setEditMode(false);
      } else {
        setRecord(buildRecord(data, v));
        setCompositeDraft(null);
        if (elementOnly) {
          setEditMode(editable);
        }
      }
    } else {
      setSelectedVersionId(null);
      setRecord(null);
      setCompositeDraft(null);
      setEditMode(false);
    }
  }

  useEffect(() => {
    setRequestedRecipeId(Number(searchParams.get("recipeId") || 0));
    setRequestedVersionId(Number(searchParams.get("versionId") || 0));
  }, [searchParams]);

  useEffect(() => {
    loadUsers();
    loadRecipes();
    fetch(`${apiBase}/api/runtime/status`)
      .then((res) => res.json())
      .then((json) => setRuntimeStatus(json.data?.recipe_store || null))
      .catch(() => setRuntimeStatus(null));
  }, [requestedRecipeId, apiBase]);

  useEffect(() => {
    if (selectedRecipeId) loadDetail(selectedRecipeId);
  }, [selectedRecipeId]);

  useEffect(() => {
    if (!selectedRecipeId) return;
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("mode", "elements");
    params.set("recipeId", String(selectedRecipeId));
    if (selectedVersionId) params.set("versionId", String(selectedVersionId));
    else params.delete("versionId");
    router.replace(`/recipes?${params.toString()}`);
  }, [selectedRecipeId, selectedVersionId, router]);

  useEffect(() => {
    if (filteredRecipes.length < 1) return;
    if (!selectedRecipeId || !filteredRecipes.some((recipe) => recipe.id === selectedRecipeId)) {
      setSelectedRecipeId(filteredRecipes[0].id);
    }
  }, [filteredRecipes, selectedRecipeId]);

  useEffect(() => {
    if (!detail || !selectedVersion) return;
    if (detail.entity_kind === "COMPOSITE") {
      setCompositeDraft(buildCompositeRecord(detail, selectedVersion));
      setRecord(null);
    } else {
      setRecord(buildRecord(detail, selectedVersion));
      setCompositeDraft(null);
    }
    if (!elementOnly) {
      setEditMode(false);
    }
    if (elementOnly && detail.entity_kind === "ELEMENT" && !elementDrawerPanel) {
      setElementDrawerPanel("ingredients");
    }
  }, [detail, selectedVersionId, selectedVersion]);

  async function createRevision(openEdit = false) {
    if (isEphemeralStore) {
      alert(runtimeStatus?.reason || "当前环境是临时数据库，不能稳定创建修订。");
      return;
    }
    if (!selectedRecipeId || !selectedUser) return;
    const res = await fetch(`${apiBase}/api/recipes/${selectedRecipeId}/revision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ created_by: selectedUser })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(`创建修订失败: ${json.error || "UNKNOWN_ERROR"}`);
      return;
    }
    const vid = Number(json?.data?.id || 0);
    await loadDetail(selectedRecipeId, vid > 0 ? vid : undefined);
    await loadRecipes();
    if (openEdit) setEditMode(true);
  }

  async function saveRecord() {
    if (isEphemeralStore) {
      alert(runtimeStatus?.reason || "当前环境是临时数据库，不能稳定保存草稿。");
      return;
    }
    if (!selectedUser || !selectedRecipeId || !selectedVersionId) return;

    if (detail?.entity_kind === "COMPOSITE") {
      if (!compositeDraft) return;
      const baseRes = await fetch(`${apiBase}/api/recipes/${selectedRecipeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: compositeDraft.meta.dish_code,
          name: compositeDraft.meta.dish_name,
          business_type: compositeDraft.meta.business_type,
          menu_cycle: compositeDraft.meta.menu_cycle ?? "",
          actor: selectedUser
        })
      });
      const baseJson = await baseRes.json().catch(() => ({}));
      if (!baseRes.ok) {
        alert(`保存食谱信息失败: ${baseJson.error || "UNKNOWN_ERROR"}`);
        return;
      }
      const instructions = compositeDraft.assembly_steps
        .slice()
        .sort((a, b) => a.step_no - b.step_no)
        .map((s) => `${Number(s.step_no)}. ${String(s.action || "").trim()}`)
        .filter((line) => line !== "0. ")
        .join("\n");
      const versionRes = await fetch(`${apiBase}/api/recipes/versions/${selectedVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: selectedUser,
          yield: selectedVersion?.yield || selectedVersion?.servings || "1道",
          instructions,
          recipe_record_json: compositeDraft
        })
      });
      const versionJson = await versionRes.json().catch(() => ({}));
      if (!versionRes.ok) {
        alert(`保存失败: ${versionJson.error || "UNKNOWN_ERROR"}`);
        return;
      }
      await loadDetail(selectedRecipeId, selectedVersionId);
      await loadRecipes();
      setEditMode(false);
      alert("保存成功");
      return;
    }

    if (!record) return;

    const baseRes = await fetch(`${apiBase}/api/recipes/${selectedRecipeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: record.meta.dish_code,
        name: record.meta.dish_name,
        business_type: record.meta.business_type,
        menu_cycle: record.meta.menu_cycle ?? "",
        actor: selectedUser
      })
    });
    const baseJson = await baseRes.json().catch(() => ({}));
    if (!baseRes.ok) {
      alert(`保存食谱信息失败: ${baseJson.error || "UNKNOWN_ERROR"}`);
      return;
    }

    const instructions = record.steps
      .slice()
      .sort((a, b) => a.step_no - b.step_no)
      .map((s) => String(s.action || "").trim())
      .filter(Boolean)
      .join("\n");

    const versionRes = await fetch(`${apiBase}/api/recipes/versions/${selectedVersionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor: selectedUser,
        yield: record.production.yield,
        instructions,
        ingredients: record.ingredients,
        recipe_record_json: record
      })
    });
    const versionJson = await versionRes.json().catch(() => ({}));
    if (!versionRes.ok) {
      alert(`保存失败: ${versionJson.error || "UNKNOWN_ERROR"}`);
      return;
    }

    await loadDetail(selectedRecipeId, selectedVersionId);
    await loadRecipes();
    setEditMode(false);
    alert("保存成功");
  }

  async function submitForApproval() {
    if (isEphemeralStore) {
      alert(runtimeStatus?.reason || "当前环境是临时数据库，不能稳定提交审批。");
      return;
    }
    if (!selectedVersionId || !selectedUser) return;
    const res = await fetch(`${apiBase}/api/recipes/versions/${selectedVersionId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: selectedUser })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(`提交失败: ${json.error || "UNKNOWN_ERROR"}`);
      return;
    }
    if (selectedRecipeId) {
      await loadDetail(selectedRecipeId, selectedVersionId);
      await loadRecipes();
    }
    alert("已提交审批");
  }

  function setCompositeMeta<K extends keyof CompositeRecordJson["meta"]>(key: K, value: CompositeRecordJson["meta"][K]) {
    setCompositeDraft((prev) => (prev ? { ...prev, meta: { ...prev.meta, [key]: value } } : prev));
  }

  function setCompositeComponent(index: number, patch: Partial<CompositeRecordJson["assembly_components"][number]>) {
    setCompositeDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.assembly_components];
      next[index] = { ...next[index], ...patch };
      return { ...prev, assembly_components: next };
    });
  }

  function setCompositeStep(index: number, patch: Partial<CompositeRecordJson["assembly_steps"][number]>) {
    setCompositeDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.assembly_steps];
      next[index] = { ...next[index], ...patch };
      return { ...prev, assembly_steps: next };
    });
  }

  function setMeta<K extends keyof RecipeRecordJson["meta"]>(key: K, value: RecipeRecordJson["meta"][K]) {
    setRecord((prev) => (prev ? { ...prev, meta: { ...prev.meta, [key]: value } } : prev));
  }

  function setProduction<K extends keyof RecipeRecordJson["production"]>(key: K, value: RecipeRecordJson["production"][K]) {
    setRecord((prev) => (prev ? { ...prev, production: { ...prev.production, [key]: value } } : prev));
  }

  function setIngredient(index: number, patch: Partial<RecipeRecordJson["ingredients"][number]>) {
    setRecord((prev) => {
      if (!prev) return prev;
      const arr = [...prev.ingredients];
      arr[index] = { ...arr[index], ...patch };
      return { ...prev, ingredients: arr };
    });
  }

  function setStep(index: number, patch: Partial<RecipeRecordJson["steps"][number]>) {
    setRecord((prev) => {
      if (!prev) return prev;
      const arr = [...prev.steps];
      arr[index] = { ...arr[index], ...patch };
      return { ...prev, steps: arr };
    });
  }

  const viewRecord = record;
  const viewComposite = compositeDraft;
  const canEditVersion = Boolean(selectedVersion && canEdit && (selectedVersion.status === "DRAFT" || selectedVersion.status === "REJECTED"));

  return (
    <>
      <section className="ui24-card">
        <div className="row" style={{ gap: 12 }}>
          {isEphemeralStore && (
            <div className="ui24-muted" style={{ color: "#b45309", width: "100%" }}>
              当前环境是临时数据库。保存、创建修订、提交审批已禁用。{runtimeStatus?.reason || ""}
            </div>
          )}
          <div className="field" style={{ minWidth: 260 }}>
            <label>当前身份</label>
            <select className="ui24-select" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
              {users.map((user) => (
                <option key={user.id} value={user.email}>{user.name} / {user.role}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 180 }}>
            <label>业务筛选</label>
            <select className="ui24-select" value={recipeFilter} onChange={(e) => setRecipeFilter(e.target.value as "ALL" | "MENU" | "BACKBONE")}>
              <option value="ALL">全部</option>
              <option value="MENU">仅 MENU</option>
              <option value="BACKBONE">仅 BACKBONE</option>
            </select>
          </div>
          {!elementOnly && (
            <div className="field" style={{ minWidth: 180 }}>
              <label>结构视角</label>
              <select className="ui24-select" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value as "COMPOSITE" | "ELEMENT" | "ALL")}>
                <option value="COMPOSITE">只看菜式</option>
                <option value="ELEMENT">只看 Element</option>
                <option value="ALL">全部</option>
              </select>
            </div>
          )}
          <div className="field" style={{ minWidth: 240, flex: 1 }}>
            <label>{elementOnly ? "搜索子配方" : "搜索"}</label>
            <input className="ui24-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={elementOnly ? "输入 element 名称或编码" : "输入名称或编码"} />
          </div>
          <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => { loadUsers(); loadRecipes(); if (selectedRecipeId) loadDetail(selectedRecipeId); }}>刷新</button>
        </div>
        {!elementOnly && (
          <div className="row" style={{ marginTop: 10 }}>
            <span className="ui24-muted">菜式 {recipeStats.composites}</span>
            <span className="ui24-muted">Element {recipeStats.elements}</span>
            <span className="ui24-muted">总数 {recipeStats.total}</span>
          </div>
        )}
      </section>

      <section className="ui24-card">
        <h2 style={{ marginBottom: 10 }}>{elementOnly ? "子配方列表" : "待编辑记录"}</h2>
        <div className="ui24-muted" style={{ marginBottom: 8 }}>
          {elementOnly ? "搜索并打开子配方，然后直接改原料或步骤。" : "录入、修订、保存都集中在这里，不再单独保留编辑页入口。"}
        </div>
        {elementOnly ? (
          <div style={{ display: "grid", gap: 8 }}>
            {filteredRecipes.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                className="ui24-listitem"
                onClick={() => {
                  setSelectedRecipeId(recipe.id);
                  setEditMode(Boolean(canEdit));
                  setElementDrawerPanel("ingredients");
                }}
                style={{
                  textAlign: "left",
                  background: selectedRecipeId === recipe.id ? "#1f2937" : undefined,
                  borderColor: selectedRecipeId === recipe.id ? "#2563eb" : undefined
                }}
              >
                <div style={{ fontWeight: 700, color: "#fff" }}>{recipe.name}</div>
                <div className="ui24-muted">{recipe.technique_family || "OTHER"} / {recipe.business_type}</div>
              </button>
            ))}
            {filteredRecipes.length < 1 && <div className="ui24-muted">没有匹配的子配方。</div>}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>编码</th>
                <th>名称</th>
                <th>结构</th>
                <th>类型</th>
                <th>菜单周期</th>
                <th>当前版本</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipes.map((recipe) => (
                <tr
                  key={recipe.id}
                  onClick={() => setSelectedRecipeId(recipe.id)}
                  style={{
                    cursor: "pointer",
                    background:
                      selectedRecipeId === recipe.id
                        ? "#dbeafe"
                        : recipe.entity_kind === "COMPOSITE"
                          ? "#f8fbff"
                          : "#f8fafc"
                  }}
                >
                  <td>{recipe.code}</td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{recipe.name}</div>
                    <div className="ui24-muted">{recipe.entity_kind === "COMPOSITE" ? "整道菜式" : "底层 Element"}</div>
                  </td>
                  <td>{recipe.entity_kind}</td>
                  <td>{recipe.business_type}</td>
                  <td>{recipe.menu_cycle || "-"}</td>
                  <td>{recipe.active_version_no ? `v${recipe.active_version_no}` : "-"}</td>
                  <td>{recipe.active_status || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="ui24-card">
        <h2 style={{ marginBottom: 10 }}>{detail?.entity_kind === "COMPOSITE" ? "菜式结构 + Assembly" : "配方 + 制作步骤"}</h2>
        {!detail || !selectedVersion || (!viewRecord && !viewComposite) ? (
          <p className="ui24-muted">请选择食谱和版本</p>
        ) : (
          <>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>
                <strong>{detail.name}</strong>（{detail.code}）/{detail.entity_kind}/{detail.business_type}
                {detail.menu_cycle ? `/${detail.menu_cycle}` : ""}
              </span>
              <div className="row">
                <select className="ui24-select" value={selectedVersionId || ""} onChange={(e) => setSelectedVersionId(Number(e.target.value))} style={{ maxWidth: 220 }}>
                  {detail.versions.map((v) => (
                    <option key={v.id} value={v.id}>v{v.version_no} / {v.status}</option>
                  ))}
                </select>
                {canEditVersion ? (
                  editMode ? (
                    <>
                      <button className="ui24-btn" type="button" onClick={saveRecord} disabled={isEphemeralStore}>保存</button>
                      <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => { setRecord(buildRecord(detail, selectedVersion)); setEditMode(false); }}>取消</button>
                    </>
                  ) : (
                    <button className="ui24-btn" type="button" onClick={() => setEditMode(true)} disabled={isEphemeralStore}>进入编辑模式</button>
                  )
                ) : canEdit ? (
                  <button className="ui24-btn" type="button" onClick={() => createRevision(true)} disabled={isEphemeralStore}>创建修订并编辑</button>
                ) : null}
                <button className="ui24-btn ui24-btn-ghost" type="button" disabled={!canEditVersion || editMode || isEphemeralStore} onClick={submitForApproval}>提交审批</button>
              </div>
            </div>

            {elementOnly && detail.entity_kind === "ELEMENT" && viewRecord ? (
              <>
                <div className="ui24-card" style={{ background: "#171717", marginTop: 10 }}>
                  <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, marginBottom: 6 }}>{detail.name}</div>
                  <div className="ui24-muted" style={{ marginBottom: 10 }}>{detail.technique_family || "OTHER"} / {detail.business_type}</div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => setElementDrawerPanel("ingredients")}>修改原料</button>
                    <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => setElementDrawerPanel("steps")}>修改步骤</button>
                    <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => setElementDrawerPanel("meta")}>基本信息</button>
                  </div>
                </div>
                {!canEditVersion && <p className="ui24-muted" style={{ marginTop: 10 }}>当前版本状态为 {selectedVersion.status}，点击“创建修订并编辑”后再修改。</p>}
              </>
            ) : detail.entity_kind === "COMPOSITE" && viewComposite ? (
              <>
                <div className="ui24-grid-2" style={{ marginTop: 10 }}>
                  <div className="ui24-card" style={{ background: "#171717" }}>
                    <h3 style={{ marginTop: 0 }}>Composite 信息</h3>
                    <div className="field"><label>菜名</label><input className="ui24-input" value={viewComposite.meta.dish_name} onChange={(e) => setCompositeMeta("dish_name", e.target.value)} readOnly={!editMode} /></div>
                    <div className="field"><label>显示名</label><input className="ui24-input" value={viewComposite.meta.display_name || ""} onChange={(e) => setCompositeMeta("display_name", e.target.value)} readOnly={!editMode} /></div>
                    <div className="field"><label>别名（逗号分隔）</label><input className="ui24-input" value={Array.isArray(viewComposite.meta.aliases) ? viewComposite.meta.aliases.join(", ") : ""} onChange={(e) => setCompositeMeta("aliases", e.target.value.split(/[\n,，、;；]/g).map((v) => v.trim()).filter(Boolean))} readOnly={!editMode} /></div>
                    <div className="field"><label>菜单周期</label><input className="ui24-input" value={viewComposite.meta.menu_cycle || ""} onChange={(e) => setCompositeMeta("menu_cycle", e.target.value || null)} readOnly={!editMode} /></div>
                    <div className="ui24-muted">business: {viewComposite.meta.business_type}</div>
                    <div className="ui24-muted">components: {viewComposite.assembly_components.length}</div>
                    <div className="ui24-muted">assembly steps: {viewComposite.assembly_steps.length}</div>
                  </div>
                  <div className="ui24-card" style={{ background: "#171717" }}>
                    <h3 style={{ marginTop: 0 }}>当前版本</h3>
                    <div className="ui24-muted">v{selectedVersion.version_no} / {selectedVersion.status}</div>
                    <div className="ui24-muted">created by: {selectedVersion.created_by}</div>
                    <div className="ui24-muted">updated: {selectedVersion.updated_at}</div>
                    <div className="ui24-muted">technique: {detail.technique_family || "-"}</div>
                  </div>
                </div>

                <h3 style={{ marginTop: 12, marginBottom: 8 }}>结构组件</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th>child code</th>
                      <th>名称</th>
                      <th>角色</th>
                      <th>阶段</th>
                      <th>数量</th>
                      <th>说明</th>
                      <th>动作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewComposite.assembly_components.map((component, idx) => (
                      <tr key={`${component.ref_name}-${idx}`}>
                        <td>{editMode ? <select className="ui24-select" value={component.component_kind} onChange={(e) => setCompositeComponent(idx, { component_kind: e.target.value })}><option value="RECIPE_REF">RECIPE_REF</option><option value="REFERENCE_PREP">REFERENCE_PREP</option><option value="RAW_ITEM">RAW_ITEM</option><option value="FINISH_ITEM">FINISH_ITEM</option></select> : component.component_kind}</td>
                        <td>{editMode ? <input className="ui24-input" value={component.child_code || ""} onChange={(e) => setCompositeComponent(idx, { child_code: e.target.value })} /> : (component.child_code || "-")}</td>
                        <td>{editMode ? <input className="ui24-input" value={component.ref_name} onChange={(e) => setCompositeComponent(idx, { ref_name: e.target.value })} /> : component.ref_name}</td>
                        <td>{editMode ? <input className="ui24-input" value={component.component_role || ""} onChange={(e) => setCompositeComponent(idx, { component_role: e.target.value })} /> : (component.component_role || "-")}</td>
                        <td>{editMode ? <input className="ui24-input" value={component.section || "ASSEMBLY"} onChange={(e) => setCompositeComponent(idx, { section: e.target.value })} /> : (component.section || "ASSEMBLY")}</td>
                        <td>{editMode ? <div className="row" style={{ gap: 6 }}><input className="ui24-input" value={component.quantity || ""} onChange={(e) => setCompositeComponent(idx, { quantity: e.target.value })} style={{ maxWidth: 80 }} /><input className="ui24-input" value={component.unit || ""} onChange={(e) => setCompositeComponent(idx, { unit: e.target.value })} style={{ maxWidth: 80 }} /></div> : component.quantity ? `${component.quantity}${component.unit ? ` ${component.unit}` : ""}` : "-"}</td>
                        <td>{editMode ? <input className="ui24-input" value={component.prep_note || component.source_ref || ""} onChange={(e) => setCompositeComponent(idx, { prep_note: e.target.value })} /> : (component.prep_note || component.source_ref || "-")}</td>
                        <td>
                          {!editMode && selectedVersion.components?.[idx]?.child_recipe_id ? (
                            <button
                              className="ui24-btn ui24-btn-ghost"
                              type="button"
                              onClick={() => openChildRecipe(
                                Number(selectedVersion.components?.[idx]?.child_recipe_id || 0),
                                selectedVersion.components?.[idx]?.child_version_id || null
                              )}
                            >
                              编辑子配方
                            </button>
                          ) : editMode ? (
                            <button className="ui24-btn ui24-btn-danger" type="button" onClick={() => setCompositeDraft((prev) => prev ? { ...prev, assembly_components: prev.assembly_components.filter((_, i) => i !== idx).map((item, order) => ({ ...item, sort_order: order + 1 })) } : prev)}>删除</button>
                          ) : "-"}
                        </td>
                      </tr>
                    ))}
                    {viewComposite.assembly_components.length < 1 && <tr><td colSpan={8} className="ui24-muted">当前 composite 暂无组件</td></tr>}
                  </tbody>
                </table>
                {editMode && <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => setCompositeDraft((prev) => prev ? { ...prev, assembly_components: [...prev.assembly_components, emptyCompositeComponent(prev.assembly_components.length + 1)] } : prev)}>+ 添加组件</button>}

                <h3 style={{ marginTop: 12, marginBottom: 8 }}>Assembly 步骤</h3>
                <table className="table">
                  <thead><tr><th>步骤</th><th>动作</th>{editMode && <th>操作</th>}</tr></thead>
                  <tbody>
                    {viewComposite.assembly_steps.slice().sort((a, b) => a.step_no - b.step_no).map((step, idx) => (
                      <tr key={step.step_id || `assembly-${idx}`}>
                        <td>{editMode ? <input className="ui24-input" type="number" value={step.step_no} onChange={(e) => setCompositeStep(idx, { step_no: Number(e.target.value || 1) })} /> : step.step_no}</td>
                        <td>{editMode ? <input className="ui24-input" value={step.action} onChange={(e) => setCompositeStep(idx, { action: e.target.value })} /> : step.action}</td>
                        {editMode && <td><button className="ui24-btn ui24-btn-danger" type="button" onClick={() => setCompositeDraft((prev) => prev ? { ...prev, assembly_steps: prev.assembly_steps.filter((_, i) => i !== idx).map((item, order) => ({ ...item, step_no: order + 1, step_id: item.step_id || `assembly_${String(order + 1).padStart(3, "0")}` })) } : prev)}>删除</button></td>}
                      </tr>
                    ))}
                    {viewComposite.assembly_steps.length < 1 && <tr><td colSpan={editMode ? 3 : 2} className="ui24-muted">暂无 assembly 步骤</td></tr>}
                  </tbody>
                </table>
                {editMode && <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => setCompositeDraft((prev) => prev ? { ...prev, assembly_steps: [...prev.assembly_steps, emptyCompositeStep(prev.assembly_steps.length + 1)] } : prev)}>+ 添加 Assembly 步骤</button>}
                {!canEditVersion && <p className="ui24-muted" style={{ marginTop: 10 }}>当前版本状态为 {selectedVersion.status}，不可直接编辑。点击“创建修订并编辑”即可。</p>}
              </>
            ) : viewRecord ? (
              <>
                <div className="ui24-grid-2" style={{ marginTop: 10 }}>
                  <div className="field"><label>产出 / Yield</label><input className="ui24-input" value={viewRecord.production.yield} onChange={(e) => setProduction("yield", e.target.value)} readOnly={!editMode} /></div>
                  <div className="field"><label>净料率</label><input className="ui24-input" type="number" step={0.01} min={0.01} max={1} value={viewRecord.production.net_yield_rate} onChange={(e) => setProduction("net_yield_rate", Number(e.target.value || 0))} readOnly={!editMode} /></div>
                  <div className="field"><label>过敏原（逗号分隔）</label><input className="ui24-input" value={viewRecord.allergens.join(", ")} onChange={(e) => { const arr = e.target.value.split(/[\n,，、;；]/g).map((v) => v.trim()).filter(Boolean); setRecord((prev) => (prev ? { ...prev, allergens: arr } : prev)); }} readOnly={!editMode} /></div>
                  <div className="field"><label>饮食限制（逗号分隔）</label><input className="ui24-input" value={(viewRecord.diet_flags || []).join(", ")} onChange={(e) => { const arr = e.target.value.split(/[\n,，、;；]/g).map((v) => v.trim()).filter(Boolean); setRecord((prev) => (prev ? { ...prev, diet_flags: arr } : prev)); }} readOnly={!editMode} /></div>
                  <div className="field"><label>出品图 URL</label><input className="ui24-input" value={viewRecord.meta.plating_image_url} onChange={(e) => setMeta("plating_image_url", e.target.value)} readOnly={!editMode} /></div>
                </div>
                <h3 style={{ marginTop: 12, marginBottom: 8 }}>配方</h3>
                <table className="table">
                  <thead><tr><th>原料</th><th>数量</th><th>单位</th><th>备注</th>{editMode && <th>操作</th>}</tr></thead>
                  <tbody>
                    {viewRecord.ingredients.map((ing, idx) => (
                      <tr key={`ing-${idx}`}>
                        <td>{editMode ? <input className="ui24-input" value={ing.name} onChange={(e) => setIngredient(idx, { name: e.target.value })} /> : ing.name}</td>
                        <td>{editMode ? <input className="ui24-input" value={ing.quantity} onChange={(e) => setIngredient(idx, { quantity: e.target.value })} /> : ing.quantity}</td>
                        <td>{editMode ? <input className="ui24-input" value={ing.unit} onChange={(e) => setIngredient(idx, { unit: e.target.value })} /> : ing.unit}</td>
                        <td>{editMode ? <input className="ui24-input" value={ing.note || ""} onChange={(e) => setIngredient(idx, { note: e.target.value })} /> : (ing.note || "-")}</td>
                        {editMode && <td><button className="ui24-btn ui24-btn-danger" type="button" onClick={() => setRecord((prev) => prev ? { ...prev, ingredients: prev.ingredients.filter((_, i) => i !== idx) } : prev)}>删除</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {editMode && <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => setRecord((prev) => prev ? { ...prev, ingredients: [...prev.ingredients, emptyIngredient()] } : prev)}>+ 添加原料</button>}
                <h3 style={{ marginTop: 12, marginBottom: 8 }}>制作步骤</h3>
                <table className="table">
                  <thead><tr><th>步骤</th><th>动作</th><th>时间(s)</th><th>温度(C)</th><th>CCP</th>{editMode && <th>操作</th>}</tr></thead>
                  <tbody>
                    {viewRecord.steps.slice().sort((a, b) => a.step_no - b.step_no).map((step, idx) => (
                      <tr key={`step-${idx}`}>
                        <td>{editMode ? <input className="ui24-input" type="number" value={step.step_no} onChange={(e) => setStep(idx, { step_no: Number(e.target.value || 1) })} /> : step.step_no}</td>
                        <td>{editMode ? <input className="ui24-input" value={step.action} onChange={(e) => setStep(idx, { action: e.target.value })} /> : step.action}</td>
                        <td>{editMode ? <input className="ui24-input" type="number" value={step.time_sec} onChange={(e) => setStep(idx, { time_sec: Number(e.target.value || 0) })} /> : step.time_sec}</td>
                        <td>{editMode ? <input className="ui24-input" type="number" value={step.temp_c ?? ""} onChange={(e) => setStep(idx, { temp_c: e.target.value ? Number(e.target.value) : undefined })} /> : (step.temp_c ?? "-")}</td>
                        <td>{editMode ? <input className="ui24-input" value={step.ccp || ""} onChange={(e) => setStep(idx, { ccp: e.target.value })} /> : (step.ccp || "-")}</td>
                        {editMode && <td><button className="ui24-btn ui24-btn-danger" type="button" onClick={() => setRecord((prev) => prev ? { ...prev, steps: prev.steps.filter((_, i) => i !== idx).map((s, n) => ({ ...s, step_no: n + 1 })) } : prev)}>删除</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {editMode && <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => setRecord((prev) => prev ? { ...prev, steps: [...prev.steps, emptyStep(prev.steps.length + 1)] } : prev)}>+ 添加步骤</button>}
                {!canEditVersion && <p className="ui24-muted" style={{ marginTop: 10 }}>当前版本状态为 {selectedVersion.status}，不可直接编辑。点击“创建修订并编辑”即可。</p>}
              </>
            ) : null}
          </>
        )}
      </section>

      {elementOnly && elementDrawerPanel && detail?.entity_kind === "ELEMENT" && viewRecord && selectedVersion && (
        <div className="ui24-drawer-backdrop" onClick={() => setElementDrawerPanel(null)}>
          <div className="ui24-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>
                  {elementDrawerPanel === "ingredients" ? "修改原料" : elementDrawerPanel === "steps" ? "修改步骤" : "基本信息"}
                </h2>
                <div className="ui24-muted">{detail.name}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {!canEditVersion && canEdit && (
                  <button className="ui24-btn" type="button" disabled={isEphemeralStore} onClick={() => createRevision(true)}>
                    创建修订
                  </button>
                )}
                {canEditVersion && !editMode && (
                  <button className="ui24-btn" type="button" onClick={() => setEditMode(true)}>
                    进入编辑
                  </button>
                )}
                {canEditVersion && editMode && (
                  <button className="ui24-btn" type="button" disabled={isEphemeralStore} onClick={saveRecord}>
                    保存
                  </button>
                )}
                <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => setElementDrawerPanel(null)}>确认返回</button>
              </div>
            </div>

            {elementDrawerPanel === "meta" && (
              <>
                <div className="ui24-grid-2">
                  <div className="field"><label>菜名</label><input className="ui24-input" value={viewRecord.meta.dish_name} onChange={(e) => setMeta("dish_name", e.target.value)} readOnly={!editMode} /></div>
                  <div className="field"><label>产出 / Yield</label><input className="ui24-input" value={viewRecord.production.yield} onChange={(e) => setProduction("yield", e.target.value)} readOnly={!editMode} /></div>
                </div>
                <div className="ui24-grid-2" style={{ marginTop: 8 }}>
                  <div className="field"><label>菜单周期</label><input className="ui24-input" value={viewRecord.meta.menu_cycle || ""} onChange={(e) => setMeta("menu_cycle", e.target.value || null)} readOnly={!editMode} /></div>
                  <div className="field"><label>业务分类</label><input className="ui24-input" value={viewRecord.meta.business_type} readOnly /></div>
                </div>
              </>
            )}

            {elementDrawerPanel === "ingredients" && (
              <>
                <div className="ui24-muted" style={{ marginBottom: 10 }}>这里只改原料。</div>
                {viewRecord.ingredients.map((ing, idx) => (
                  <div key={`drawer-edit-ing-${idx}`} className="ui24-card" style={{ background: "#171717", marginBottom: 10 }}>
                    <div className="ui24-muted" style={{ marginBottom: 10 }}>原料 {idx + 1}</div>
                    <div className="ui24-grid-2" style={{ marginBottom: 8 }}>
                      <div className="field">
                        <label className="ui24-label">名称</label>
                        <input className="ui24-input" value={ing.name} onChange={(e) => setIngredient(idx, { name: e.target.value })} placeholder="名称" readOnly={!editMode} />
                      </div>
                      <div className="field">
                        <label className="ui24-label">备注</label>
                        <input className="ui24-input" value={ing.note || ""} onChange={(e) => setIngredient(idx, { note: e.target.value })} placeholder="备注" readOnly={!editMode} />
                      </div>
                    </div>
                    <div className="ui24-grid-2">
                      <div className="field">
                        <label className="ui24-label">数量</label>
                        <input className="ui24-input" value={ing.quantity} onChange={(e) => setIngredient(idx, { quantity: e.target.value })} placeholder="数量" readOnly={!editMode} />
                      </div>
                      <div className="field">
                        <label className="ui24-label">单位</label>
                        <input className="ui24-input" value={ing.unit} onChange={(e) => setIngredient(idx, { unit: e.target.value })} placeholder="单位" readOnly={!editMode} />
                      </div>
                    </div>
                    {editMode && (
                      <div className="row" style={{ marginTop: 10 }}>
                        <button className="ui24-btn ui24-btn-danger" type="button" onClick={() => setRecord((prev) => prev ? { ...prev, ingredients: prev.ingredients.filter((_, i) => i !== idx) } : prev)}>删除</button>
                      </div>
                    )}
                  </div>
                ))}
                {editMode && <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => setRecord((prev) => prev ? { ...prev, ingredients: [...prev.ingredients, emptyIngredient()] } : prev)}>+ 添加原料</button>}
              </>
            )}

            {elementDrawerPanel === "steps" && (
              <>
                <div className="ui24-muted" style={{ marginBottom: 10 }}>这里只改步骤。</div>
                {viewRecord.steps.slice().sort((a, b) => a.step_no - b.step_no).map((step, idx) => (
                  <div key={`drawer-edit-step-${idx}`} className="ui24-card" style={{ background: "#171717", marginBottom: 8 }}>
                    <div className="ui24-grid-2" style={{ marginBottom: 8 }}>
                      <div className="field">
                        <label className="ui24-label">步骤号</label>
                        <input className="ui24-input" type="number" value={step.step_no} onChange={(e) => setStep(idx, { step_no: Number(e.target.value || 1) })} readOnly={!editMode} />
                      </div>
                      <div className="field">
                        <label className="ui24-label">时长（秒）</label>
                        <input className="ui24-input" value={step.time_sec > 0 ? String(step.time_sec) : ""} onChange={(e) => setStep(idx, { time_sec: Number(e.target.value || 0) })} placeholder="时长秒" readOnly={!editMode} />
                      </div>
                    </div>
                    <div className="field">
                      <label className="ui24-label">动作</label>
                      <textarea className="ui24-textarea" style={{ minHeight: 84 }} value={step.action} onChange={(e) => setStep(idx, { action: e.target.value })} placeholder="步骤动作" readOnly={!editMode} />
                    </div>
                    {editMode && (
                      <div className="row" style={{ marginTop: 10 }}>
                      {editMode && <button className="ui24-btn ui24-btn-danger" type="button" onClick={() => setRecord((prev) => prev ? { ...prev, steps: prev.steps.filter((_, i) => i !== idx).map((s, n) => ({ ...s, step_no: n + 1 })) } : prev)}>删除</button>}
                      </div>
                    )}
                  </div>
                ))}
                {editMode && <button className="ui24-btn ui24-btn-ghost" type="button" onClick={() => setRecord((prev) => prev ? { ...prev, steps: [...prev.steps, emptyStep(prev.steps.length + 1)] } : prev)}>+ 添加步骤</button>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
