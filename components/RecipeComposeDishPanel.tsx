"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import { mergeMenuCycles, readLocalMenuCycles } from "@/lib/menu-cycles";
import type { RecipeDetail, RecipeSummary, RecipeUser } from "@/lib/types";

type RuntimeStatus = {
  mode: "persistent" | "ephemeral";
  provider: string;
  reason: string;
};

type SelectedElement = {
  id: number;
  code: string;
  name: string;
  technique_family: string | null;
};

function inferRoleFromTechnique(technique: string | null) {
  const value = String(technique || "").toUpperCase();
  if (value.includes("SAUCE") || value.includes("BEURRE")) return "SAUCE";
  if (value.includes("PUREE")) return "PUREE";
  if (value.includes("GEL")) return "GEL";
  if (value.includes("BAVAROIS")) return "BODY";
  if (value.includes("CROUTON") || value.includes("CRUMBLE")) return "TEXTURE";
  if (value.includes("PICKLE")) return "ACID";
  if (value.includes("STOCK")) return "BASE";
  return "COMPONENT";
}

function inferSectionFromTechnique(technique: string | null): "PREP" | "INTERMEDIATE" | "ASSEMBLY" | "FINISH" | "PLATING" {
  const value = String(technique || "").toUpperCase();
  if (value.includes("GARNISH") || value.includes("PLATING")) return "PLATING";
  if (value.includes("SAUCE")) return "FINISH";
  return "ASSEMBLY";
}

export default function RecipeComposeDishPanel() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [users, setUsers] = useState<RecipeUser[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [menuCycles, setMenuCycles] = useState<string[]>([]);
  const [dishName, setDishName] = useState("");
  const [dishCode, setDishCode] = useState("");
  const [menuCycle, setMenuCycle] = useState("");
  const [assemblyStepText, setAssemblyStepText] = useState("按出品顺序组合各 element 并完成最终装盘。");
  const [finishItemText, setFinishItemText] = useState("");
  const [elementQuery, setElementQuery] = useState("");
  const [selectedElements, setSelectedElements] = useState<SelectedElement[]>([]);
  const [creating, setCreating] = useState(false);

  const currentUser = useMemo(
    () => users.find((user) => user.email === selectedUser) || null,
    [users, selectedUser]
  );
  const canEdit = currentUser?.role === "OWNER" || currentUser?.role === "EDITOR";
  const isEphemeralStore = runtimeStatus?.mode === "ephemeral";

  async function loadRecipes() {
    const res = await fetch(`${apiBase}/api/recipes`);
    const json = await res.json();
    const data = (json.data || []) as RecipeSummary[];
    setRecipes(data);
    setMenuCycles(mergeMenuCycles(data.map((item) => item.menu_cycle), readLocalMenuCycles()));
  }

  async function loadUsers() {
    const res = await fetch(`${apiBase}/api/recipe-users`);
    const json = await res.json();
    const data = (json.data || []) as RecipeUser[];
    setUsers(data);
    if (!selectedUser && data.length > 0) setSelectedUser(data[0].email);
  }

  useEffect(() => {
    loadRecipes();
    loadUsers();
    fetch(`${apiBase}/api/runtime/status`)
      .then((res) => res.json())
      .then((json) => setRuntimeStatus(json.data?.recipe_store || null))
      .catch(() => setRuntimeStatus(null));
  }, [apiBase]);

  const availableElements = useMemo(() => {
    const selectedIds = new Set(selectedElements.map((item) => item.id));
    const keyword = elementQuery.trim().toLowerCase();
    return recipes
      .filter((recipe) => recipe.entity_kind === "ELEMENT")
      .filter((recipe) => !selectedIds.has(recipe.id))
      .filter((recipe) => {
        if (!keyword) return true;
        return (
          recipe.name.toLowerCase().includes(keyword) ||
          recipe.code.toLowerCase().includes(keyword) ||
          String(recipe.technique_family || "").toLowerCase().includes(keyword)
        );
      })
      .slice(0, 24);
  }, [recipes, selectedElements, elementQuery]);

  function addElement(recipe: RecipeSummary) {
    setSelectedElements((prev) => [
      ...prev,
      {
        id: recipe.id,
        code: recipe.code,
        name: recipe.name,
        technique_family: recipe.technique_family || null
      }
    ]);
  }

  function removeSelectedElement(id: number) {
    setSelectedElements((prev) => prev.filter((item) => item.id !== id));
  }

  async function createCompositeDish() {
    if (isEphemeralStore) {
      alert(runtimeStatus?.reason || "当前环境是临时数据库，不能稳定创建菜式。");
      return;
    }
    if (!selectedUser) {
      alert("请先选择当前用户");
      return;
    }
    if (!dishName.trim()) {
      alert("请先填写菜式名称");
      return;
    }
    if (!menuCycle.trim()) {
      alert("请先填写菜单周期");
      return;
    }
    if (selectedElements.length < 1) {
      alert("请至少加入一个子配方");
      return;
    }
    setCreating(true);
    try {
      const assemblySteps = assemblyStepText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((action, idx) => ({
          step_id: `assembly_${String(idx + 1).padStart(3, "0")}`,
          step_no: idx + 1,
          action
        }));
      const finishItems = finishItemText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((refName, idx) => ({
          component_kind: "FINISH_ITEM",
          ref_name: refName,
          component_role: "PLATING",
          section: "PLATING",
          quantity: "",
          unit: "",
          is_optional: false,
          sort_order: selectedElements.length + idx + 1
        }));
      const res = await fetch(`${apiBase}/api/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_kind: "COMPOSITE",
          code: dishCode,
          name: dishName,
          description: "",
          menu_cycle: menuCycle,
          change_note: "录入工作台组装 Composite 菜式",
          created_by: selectedUser,
          assembly_components: [
            ...selectedElements.map((item) => ({
              component_kind: "RECIPE_REF",
              child_code: item.code,
              ref_name: item.name,
              component_role: inferRoleFromTechnique(item.technique_family),
              section: inferSectionFromTechnique(item.technique_family),
              quantity: "",
              unit: "",
              is_optional: false
            })),
            ...finishItems
          ],
          assembly_steps: assemblySteps
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`创建失败: ${json.error || "UNKNOWN_ERROR"}`);
        return;
      }
      const created = json.data as RecipeDetail;
      setDishName("");
      setDishCode("");
      setMenuCycle("");
      setAssemblyStepText("按出品顺序组合各 element 并完成最终装盘。");
      setFinishItemText("");
      setSelectedElements([]);
      await loadRecipes();
      router.push(`/recipes/view?recipeId=${created.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <section className="ui24-card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>组装菜式</h2>
            <div className="ui24-muted">只写菜名、菜单周期，加入子配方，再补 garnish / plating 和出品动作。</div>
          </div>
          <div className="ui24-muted">{selectedElements.length} 个子配方已加入</div>
        </div>
        {isEphemeralStore && (
          <div className="ui24-banner ui24-banner-warn" style={{ marginBottom: 12 }}>
            {runtimeStatus?.reason || "当前环境是临时数据库，不能稳定创建菜式。"}
          </div>
        )}
        <div className="ui24-grid-2">
          <div className="field">
            <label>菜式名称</label>
            <input className="ui24-input" value={dishName} onChange={(e) => setDishName(e.target.value)} placeholder="例如：柚子甜虾塔" />
          </div>
          <div className="field">
            <label>菜单周期</label>
            <select className="ui24-select" value={menuCycle} onChange={(e) => setMenuCycle(e.target.value)}>
              <option value="">请选择菜单周期</option>
              {menuCycles.map((cycle) => (
                <option key={`compose-cycle-${cycle}`} value={cycle}>{cycle}</option>
              ))}
            </select>
          </div>
        </div>
        <details style={{ marginTop: 10 }}>
          <summary className="ui24-muted" style={{ cursor: "pointer" }}>高级字段</summary>
          <div className="ui24-grid-2" style={{ marginTop: 10 }}>
            <div className="field">
              <label>当前用户</label>
              <select className="ui24-select" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
                {users.map((user) => (
                  <option key={user.id} value={user.email}>{user.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>菜式编码（可选）</label>
              <input className="ui24-input" value={dishCode} onChange={(e) => setDishCode(e.target.value)} placeholder="可留空，系统会自动生成" />
            </div>
          </div>
        </details>
      </section>

      <div className="ui24-grid-2" style={{ alignItems: "start", gap: 14, marginBottom: 14 }}>
        <section className="ui24-card" style={{ marginBottom: 0 }}>
          <div className="field">
            <label>搜索子配方</label>
            <input
              className="ui24-input"
              value={elementQuery}
              onChange={(e) => setElementQuery(e.target.value)}
              placeholder="搜索 sauce / gel / stock / garnish"
            />
          </div>
          {elementQuery.trim() ? (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {availableElements.length > 0 ? availableElements.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  className="ui24-listitem"
                  onClick={() => addElement(recipe)}
                  style={{ textAlign: "left" }}
                >
                  <div style={{ fontWeight: 700, color: "#fff" }}>{recipe.name}</div>
                  <div className="ui24-muted">{recipe.technique_family || "OTHER"}</div>
                </button>
              )) : (
                <div className="ui24-muted">没有匹配的子配方。</div>
              )}
            </div>
          ) : (
            <div className="ui24-muted" style={{ marginTop: 12 }}>先搜索一个子配方，再加入到右侧菜式里。</div>
          )}
        </section>

        <section className="ui24-card ui24-sticky-desktop" style={{ marginBottom: 0, top: 86 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>已加入的子配方</h3>
            <div className="ui24-muted">{selectedElements.length} 项</div>
          </div>
          {selectedElements.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {selectedElements.map((item) => (
                <div key={item.id} className="ui24-listitem" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#fff" }}>{item.name}</div>
                    <div className="ui24-muted">{item.technique_family || "OTHER"}</div>
                  </div>
                  <button className="ui24-btn ui24-btn-danger" type="button" onClick={() => removeSelectedElement(item.id)}>移除</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="ui24-muted">右侧会固定显示你已经加入的子配方。</div>
          )}
        </section>
      </div>

      <section className="ui24-card">
        <div className="field">
          <label>补充项（每行一条）</label>
          <textarea
            className="ui24-textarea"
            value={finishItemText}
            onChange={(e) => setFinishItemText(e.target.value)}
            placeholder={"例如：\nOnion blossoms\n柚子皮屑\nTableside broth"}
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>出品动作</label>
          <textarea
            className="ui24-textarea"
            value={assemblyStepText}
            onChange={(e) => setAssemblyStepText(e.target.value)}
            placeholder="每行一步"
          />
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
          <button className="ui24-btn" type="button" onClick={createCompositeDish} disabled={creating || !canEdit || isEphemeralStore}>
            {creating ? "创建中..." : "创建菜式并进入查看"}
          </button>
        </div>
      </section>
    </>
  );
}
