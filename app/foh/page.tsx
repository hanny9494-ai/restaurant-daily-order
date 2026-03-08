"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import type { RecipeUser } from "@/lib/types";

function todayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type MenuItem = {
  item_id: number;
  recipe_id: number;
  dish_name: string;
  sort_order: number;
  ingredients: Array<{ name: string }>;
};

type MenuResponse = {
  success: boolean;
  menu: {
    id: number;
    date: string;
    source: string;
    items: MenuItem[];
  } | null;
  available_recipes: Array<{ id: number; dish_name: string; type: string }>;
};

type CheckResult = {
  safe: Array<{ recipe_id: number; dish_name: string }>;
  unsafe: Array<{ recipe_id: number; dish_name: string; reason: string; triggered_ingredients?: string[] }>;
  uncertain: Array<{ recipe_id: number; dish_name: string; reason: string }>;
};

type HistoryItem = {
  id: number;
  service_date: string;
  guest_name: string | null;
  table_no: string | null;
  restrictions: string[];
  created_by: string | null;
  created_at: string;
};

export default function FohPage() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const [users, setUsers] = useState<RecipeUser[]>([]);
  const [serviceDate, setServiceDate] = useState(todayString());
  const [guestName, setGuestName] = useState("");
  const [tableNo, setTableNo] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [restrictionsText, setRestrictionsText] = useState("");
  const [menuData, setMenuData] = useState<MenuResponse | null>(null);
  const [appendRecipeId, setAppendRecipeId] = useState<number | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadUsers() {
    const res = await fetch(`${apiBase}/api/recipe-users`);
    const json = await res.json();
    const data = (json.data || []) as RecipeUser[];
    setUsers(data);
    if (!selectedUser && data.length > 0) {
      const preferred = data.find((user) => user.role === "FOH") || data.find((user) => user.role === "VIEWER") || data[0];
      setSelectedUser(preferred.email);
    }
  }

  async function loadMenu(date = serviceDate) {
    const res = await fetch(`${apiBase}/api/foh/menu?date=${encodeURIComponent(date)}`);
    const json = await res.json();
    setMenuData(json as MenuResponse);
    if (!appendRecipeId) {
      setAppendRecipeId(Number(json?.available_recipes?.[0]?.id || 0) || null);
    }
  }

  async function loadHistory(date = serviceDate) {
    const res = await fetch(`${apiBase}/api/foh/checks?date=${encodeURIComponent(date)}`);
    const json = await res.json();
    setHistory(json.data || []);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadMenu(serviceDate);
    loadHistory(serviceDate);
    setResult(null);
  }, [serviceDate]);

  async function addMenuItem() {
    if (!appendRecipeId || !selectedUser) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/foh/menu/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: serviceDate,
          recipe_id: appendRecipeId,
          actor_email: selectedUser
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`添加菜单失败: ${json.error || "UNKNOWN_ERROR"}`);
        return;
      }
      setMenuData(json as MenuResponse);
    } finally {
      setLoading(false);
    }
  }

  async function removeMenuItem(itemId: number) {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/foh/menu/items/${itemId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor_email: selectedUser })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`移除菜单失败: ${json.error || "UNKNOWN_ERROR"}`);
        return;
      }
      setMenuData(json as MenuResponse);
    } finally {
      setLoading(false);
    }
  }

  async function runCheck() {
    const restrictions = restrictionsText
      .split(/[,\n，、;；]/g)
      .map((item) => item.trim())
      .filter(Boolean);
    if (restrictions.length < 1) {
      alert("请至少输入一条忌口信息");
      return;
    }

    const menuIds = (menuData?.menu?.items || []).map((item) => item.recipe_id);

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/foh/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: serviceDate,
          guest_name: guestName,
          table_no: tableNo,
          restrictions,
          menu_recipe_ids: menuIds,
          actor_email: selectedUser
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`识别失败: ${json.error || "UNKNOWN_ERROR"}`);
        return;
      }
      setResult(json.results as CheckResult);
      await loadHistory(serviceDate);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1>前厅端口（忌口识别）</h1>
        <div className="row">
          <Link href="/ui" className="btn secondary">返回 UI 入口</Link>
          <Link href="/" className="btn secondary">返回首页</Link>
        </div>
      </div>

      <section className="card">
        <h2>当日菜单配置</h2>
        <div className="grid">
          <div className="field">
            <label>服务日期</label>
            <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
          </div>
          <div className="field">
            <label>操作人</label>
            <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
              {users.map((user) => (
                <option key={user.id} value={user.email}>{user.name} / {user.role}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <select value={appendRecipeId ?? ""} onChange={(e) => setAppendRecipeId(e.target.value ? Number(e.target.value) : null)} style={{ maxWidth: 320 }}>
            <option value="">选择菜品加入今日菜单</option>
            {(menuData?.available_recipes || []).map((recipe) => (
              <option key={recipe.id} value={recipe.id}>{recipe.dish_name} / {recipe.type}</option>
            ))}
          </select>
          <button className="btn" type="button" onClick={addMenuItem} disabled={loading || !appendRecipeId}>添加菜品</button>
          <button className="btn secondary" type="button" onClick={() => loadMenu(serviceDate)}>刷新菜单</button>
        </div>

        {(menuData?.menu?.items?.length || 0) > 0 ? (
          <table className="table" style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>菜品</th>
                <th>原料数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {(menuData?.menu?.items || []).map((item) => (
                <tr key={item.item_id}>
                  <td>{item.dish_name}</td>
                  <td>{item.ingredients?.length || 0}</td>
                  <td>
                    <button className="btn danger" type="button" onClick={() => removeMenuItem(item.item_id)} disabled={loading}>移除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted" style={{ marginTop: 8 }}>当天还没有配置菜单，先从上方添加菜品。</p>
        )}
      </section>

      <section className="card">
        <h2>客人忌口输入</h2>
        <div className="grid">
          <div className="field">
            <label>桌号</label>
            <input value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder="例如 A12" />
          </div>
          <div className="field">
            <label>客人姓名（可选）</label>
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="例如 张先生" />
          </div>
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>忌口（逗号或换行分隔）</label>
          <textarea
            value={restrictionsText}
            onChange={(e) => setRestrictionsText(e.target.value)}
            placeholder={"例如：\n海鲜过敏\n不吃辣\n花生过敏"}
          />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" type="button" onClick={runCheck} disabled={loading}>开始识别</button>
          <button className="btn secondary" type="button" onClick={() => loadHistory(serviceDate)}>刷新当日记录</button>
        </div>
      </section>

      <section className="card">
        <h2>识别结果</h2>
        {!result ? (
          <p className="muted">输入忌口后点击“开始识别”。</p>
        ) : (
          <>
            <h3>不能吃（{result.unsafe.length}）</h3>
            {result.unsafe.length === 0 ? <p className="muted">无</p> : (
              <table className="table">
                <thead>
                  <tr>
                    <th>菜品</th>
                    <th>原因</th>
                  </tr>
                </thead>
                <tbody>
                  {result.unsafe.map((item) => (
                    <tr key={`unsafe-${item.recipe_id}`}>
                      <td>{item.dish_name}</td>
                      <td>{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3 style={{ marginTop: 12 }}>需确认（{result.uncertain.length}）</h3>
            <p className="muted">{result.uncertain.map((item) => `${item.dish_name}（${item.reason}）`).join("；") || "无"}</p>

            <h3 style={{ marginTop: 12 }}>可以吃（{result.safe.length}）</h3>
            <p className="muted">{result.safe.map((item) => item.dish_name).join("、") || "无"}</p>
          </>
        )}
      </section>

      <section className="card">
        <h2>当日识别记录</h2>
        {history.length === 0 ? (
          <p className="muted">今天暂无记录。</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>客人/桌号</th>
                <th>忌口</th>
                <th>操作人</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{row.created_at}</td>
                  <td>{row.guest_name || "-"} / {row.table_no || "-"}</td>
                  <td>{(row.restrictions || []).join("、")}</td>
                  <td>{row.created_by || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
