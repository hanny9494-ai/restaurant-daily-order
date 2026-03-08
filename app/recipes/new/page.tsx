"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import type { RecipeDetail, RecipeUser } from "@/lib/types";

type IngredientDraft = {
  name: string;
  quantity: string;
  unit: string;
  note: string;
};

function emptyIngredient(): IngredientDraft {
  return { name: "", quantity: "", unit: "", note: "" };
}

export default function RecipeNewPage() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const [users, setUsers] = useState<RecipeUser[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRecipeType, setNewRecipeType] = useState<"MENU" | "BACKBONE">("BACKBONE");
  const [newMenuCycle, setNewMenuCycle] = useState("");
  const [newServings, setNewServings] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [newChangeNote, setNewChangeNote] = useState("");
  const [newIngredients, setNewIngredients] = useState<IngredientDraft[]>([emptyIngredient()]);

  const currentUser = useMemo(
    () => users.find((user) => user.email === selectedUser) || null,
    [users, selectedUser]
  );
  const canEdit = currentUser?.role === "OWNER" || currentUser?.role === "EDITOR";

  async function loadUsers() {
    const res = await fetch(`${apiBase}/api/recipe-users`);
    const json = await res.json();
    const data = (json.data || []) as RecipeUser[];
    setUsers(data);
    if (!selectedUser && data.length > 0) {
      setSelectedUser(data[0].email);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function updateNewIngredient(index: number, patch: Partial<IngredientDraft>) {
    setNewIngredients((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  }

  async function createRecipe() {
    if (!selectedUser) {
      alert("请先选择当前用户");
      return;
    }
    const ingredients = newIngredients.filter((item) => item.name.trim() || item.quantity.trim() || item.unit.trim());
    const res = await fetch(`${apiBase}/api/recipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: newCode,
        name: newName,
        description: newDescription,
        recipe_type: newRecipeType,
        menu_cycle: newMenuCycle,
        servings: newServings,
        instructions: newInstructions,
        change_note: newChangeNote,
        ingredients,
        created_by: selectedUser
      })
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(`创建失败: ${json.error || "UNKNOWN_ERROR"}`);
      return;
    }
    const json = await res.json();
    const created = json.data as RecipeDetail;
    setNewCode("");
    setNewName("");
    setNewDescription("");
    setNewRecipeType("BACKBONE");
    setNewMenuCycle("");
    setNewServings("");
    setNewInstructions("");
    setNewChangeNote("");
    setNewIngredients([emptyIngredient()]);
    alert(`食谱已创建：${created.name}`);
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1>食谱增加</h1>
        <div className="row">
          <Link href="/recipes/view" className="btn secondary">去食谱查看/修改</Link>
          <Link href="/recipes" className="btn secondary">返回食谱首页</Link>
        </div>
      </div>

      <section className="card">
        <h2>当前身份</h2>
        <div className="row" style={{ marginTop: 8 }}>
          <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} style={{ maxWidth: 360 }}>
            {users.map((user) => (
              <option key={user.id} value={user.email}>{user.name} / {user.role} / {user.email}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="card">
        <h2>新增食谱（自动创建 v1 草稿）</h2>
        <div className="grid">
          <div className="field">
            <label>食谱编码</label>
            <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="例如: BRAISED_BEEF" />
          </div>
          <div className="field">
            <label>食谱名称</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例如: 红烧牛肉" />
          </div>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          <div className="field">
            <label>描述</label>
            <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="菜品说明" />
          </div>
          <div className="field">
            <label>份量</label>
            <input value={newServings} onChange={(e) => setNewServings(e.target.value)} placeholder="例如: 1份 / 2人份" />
          </div>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          <div className="field">
            <label>食谱类型</label>
            <select value={newRecipeType} onChange={(e) => setNewRecipeType(e.target.value as "MENU" | "BACKBONE")}>
              <option value="BACKBONE">BACKBONE（基础母配方）</option>
              <option value="MENU">MENU（季度菜单）</option>
            </select>
          </div>
          <div className="field">
            <label>菜单周期（MENU 必填）</label>
            <input
              value={newMenuCycle}
              onChange={(e) => setNewMenuCycle(e.target.value)}
              placeholder="例如: 2026Q2 / 2026-Spring"
              disabled={newRecipeType !== "MENU"}
            />
          </div>
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>制作步骤</label>
          <textarea value={newInstructions} onChange={(e) => setNewInstructions(e.target.value)} />
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>变更说明</label>
          <input value={newChangeNote} onChange={(e) => setNewChangeNote(e.target.value)} placeholder="为什么要新增或调整" />
        </div>
        <h3 style={{ marginTop: 12 }}>配料</h3>
        {newIngredients.map((item, idx) => (
          <div className="grid" key={`new-ing-${idx}`} style={{ marginBottom: 8 }}>
            <input value={item.name} onChange={(e) => updateNewIngredient(idx, { name: e.target.value })} placeholder="名称" />
            <input value={item.quantity} onChange={(e) => updateNewIngredient(idx, { quantity: e.target.value })} placeholder="数量" />
            <input value={item.unit} onChange={(e) => updateNewIngredient(idx, { unit: e.target.value })} placeholder="单位" />
            <input value={item.note} onChange={(e) => updateNewIngredient(idx, { note: e.target.value })} placeholder="备注（可选）" />
          </div>
        ))}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn secondary" type="button" onClick={() => setNewIngredients((prev) => [...prev, emptyIngredient()])}>
            + 增加配料
          </button>
          <button className="btn" type="button" disabled={!canEdit} onClick={createRecipe}>
            创建食谱
          </button>
        </div>
      </section>
    </main>
  );
}
