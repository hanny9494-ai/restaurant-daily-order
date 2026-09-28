"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, OpsShell } from "@/components/ops/StaffGate";
import { api, errorMessage, money } from "@/lib/ops/client";

type Item = {
  id: number;
  name: string;
  aliases: string[];
  category: string;
  base_unit: string;
  default_supplier_id: number | null;
  default_supplier_name?: string | null;
  storage_location: string;
  par_level: number | null;
  is_active: number;
  units: Array<{ unit: string; factor_to_base: number }>;
};

type Candidate = { name: string; uses: number; last_date: string; units: string[]; supplier_id: number | null; supplier_name: string | null; matched_item_id: number | null };

type EditForm = {
  id: number | null;
  name: string;
  aliases: string;
  category: string;
  base_unit: string;
  default_supplier_id: string;
  storage_location: string;
  par_level: string;
  is_active: boolean;
  units: Array<{ unit: string; factor_to_base: string }>;
};

function emptyForm(): EditForm {
  return { id: null, name: "", aliases: "", category: "蔬菜", base_unit: "千克", default_supplier_id: "", storage_location: "冷藏", par_level: "", is_active: true, units: [] };
}

function ItemsView() {
  const [tab, setTab] = useState<"list" | "candidates">("list");
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>([]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [form, setForm] = useState<EditForm | null>(null);
  const [prices, setPrices] = useState<{ item: Item; rows: any[]; latest: any } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Record<string, { base_unit: string; category: string; storage_location: string }>>({});
  const [mergeTarget, setMergeTarget] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const res = await api<{ data: Item[]; categories: string[]; storage_locations: string[] }>("/api/items?include_inactive=1");
      setItems(res.data);
      setCategories(res.categories);
      setLocations(res.storage_locations);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function loadCandidates() {
    try {
      const res = await api<{ data: Candidate[] }>("/api/items/candidates");
      setCandidates(res.data.filter((c) => !c.matched_item_id));
      setPicked({});
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    load();
    api<{ data: Array<{ id: number; name: string }> }>("/api/suppliers").then((r) => setSuppliers(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "candidates") loadCandidates();
  }, [tab]);

  const filtered = useMemo(() => {
    const q = search.trim();
    return items.filter((i) => (!catFilter || i.category === catFilter) && (!q || i.name.includes(q) || i.aliases.some((a) => a.includes(q))));
  }, [items, search, catFilter]);

  function openEdit(item: Item) {
    setForm({
      id: item.id,
      name: item.name,
      aliases: item.aliases.join("、"),
      category: item.category,
      base_unit: item.base_unit,
      default_supplier_id: item.default_supplier_id ? String(item.default_supplier_id) : "",
      storage_location: item.storage_location,
      par_level: item.par_level === null ? "" : String(item.par_level),
      is_active: item.is_active === 1,
      units: item.units.map((u) => ({ unit: u.unit, factor_to_base: String(u.factor_to_base) }))
    });
  }

  async function saveForm() {
    if (!form) return;
    const body = {
      name: form.name,
      aliases: form.aliases,
      category: form.category,
      base_unit: form.base_unit,
      default_supplier_id: form.default_supplier_id ? Number(form.default_supplier_id) : null,
      storage_location: form.storage_location,
      par_level: form.par_level === "" ? null : Number(form.par_level),
      is_active: form.is_active ? 1 : 0,
      units: form.units.filter((u) => u.unit.trim()).map((u) => ({ unit: u.unit.trim(), factor_to_base: Number(u.factor_to_base) }))
    };
    try {
      if (form.id) await api(`/api/items/${form.id}`, { method: "PATCH", body });
      else await api("/api/items", { body });
      setForm(null);
      await load();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function showPrices(item: Item) {
    try {
      const res = await api<{ data: any[]; latest: any }>(`/api/items/${item.id}/prices`);
      setPrices({ item, rows: res.data, latest: res.latest });
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function createFromCandidates() {
    const rows = Object.entries(picked).map(([name, v]) => ({
      name,
      base_unit: v.base_unit,
      category: v.category,
      storage_location: v.storage_location,
      default_supplier_id: candidates.find((c) => c.name === name)?.supplier_id ?? null
    }));
    if (rows.length === 0) return;
    try {
      await api("/api/items/candidates", { body: { rows } });
      await load();
      await loadCandidates();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function mergeIntoExisting() {
    const names = Object.keys(picked);
    if (!mergeTarget || names.length === 0) return;
    const target = items.find((i) => String(i.id) === mergeTarget);
    if (!window.confirm(`把 ${names.join("、")} 作为别名合并到「${target?.name}」？历史下单会自动归到该品项。`)) return;
    try {
      await api(`/api/items/${mergeTarget}/merge`, { body: { names } });
      await load();
      await loadCandidates();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  function togglePick(c: Candidate) {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[c.name]) delete next[c.name];
      else next[c.name] = { base_unit: c.units[0] || "个", category: "其他", storage_location: "干仓" };
      return next;
    });
  }

  return (
    <>
      <section className="card">
        <div className="seg">
          <button className={tab === "list" ? "active" : ""} onClick={() => setTab("list")}>品项列表（{items.filter((i) => i.is_active).length}）</button>
          <button className={tab === "candidates" ? "active" : ""} onClick={() => setTab("candidates")}>待归并 / 历史候选</button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>

      {tab === "list" && (
        <>
          <section className="card">
            <div className="row">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索品名 / 别名" style={{ flex: 1 }} />
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ maxWidth: 140 }}>
                <option value="">全部品类</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn" onClick={() => setForm(emptyForm())}>+ 新建品项</button>
            </div>
          </section>
          {filtered.map((i) => (
            <div key={i.id} className="line-card" style={{ opacity: i.is_active ? 1 : 0.55 }}>
              <div className="line-head">
                <div>
                  <div className="line-title">{i.name}</div>
                  {i.aliases.length > 0 && <div className="muted" style={{ fontSize: 13 }}>别名：{i.aliases.join("、")}</div>}
                </div>
                <span className="badge">{i.category}</span>
              </div>
              <div className="kv">
                <span>基准单位 <b>{i.base_unit}</b></span>
                <span>储位 <b>{i.storage_location}</b></span>
                {i.default_supplier_name && <span>默认供应商 <b>{i.default_supplier_name}</b></span>}
                {i.units.map((u) => <span key={u.unit}>1{u.unit} = <b>{u.factor_to_base}{i.base_unit}</b></span>)}
                {i.par_level !== null && <span>安全库存 <b>{i.par_level}</b></span>}
                {!i.is_active && <span className="badge bad">已停用</span>}
              </div>
              <div className="row">
                <button className="btn secondary" onClick={() => openEdit(i)}>编辑</button>
                <button className="btn secondary" onClick={() => showPrices(i)}>价格历史</button>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "candidates" && (
        <section className="card">
          <p className="muted">以下是历史下单 / 自由输入的品名中还没关联品项主档的，勾选后可批量建成新品项，或作为别名合并进已有品项。</p>
          {candidates.length === 0 && <p className="muted">没有待归并品名。</p>}
          {candidates.map((c) => {
            const p = picked[c.name];
            return (
              <div key={c.name} className="line-card">
                <label className="row" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={Boolean(p)} onChange={() => togglePick(c)} style={{ width: "auto" }} />
                  <b>{c.name}</b>
                  <span className="muted">用过 {c.uses} 次 · {c.units.join("/")} · {c.supplier_name || ""} · 最近 {c.last_date}</span>
                </label>
                {p && (
                  <div className="grid" style={{ marginTop: 6 }}>
                    <input value={p.base_unit} onChange={(e) => setPicked({ ...picked, [c.name]: { ...p, base_unit: e.target.value } })} placeholder="基准单位" />
                    <select value={p.category} onChange={(e) => setPicked({ ...picked, [c.name]: { ...p, category: e.target.value } })}>
                      {categories.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <select value={p.storage_location} onChange={(e) => setPicked({ ...picked, [c.name]: { ...p, storage_location: e.target.value } })}>
                      {locations.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
          {Object.keys(picked).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <button className="big-btn" style={{ width: "100%" }} onClick={createFromCandidates}>建成 {Object.keys(picked).length} 个新品项</button>
              <div className="row" style={{ marginTop: 10 }}>
                <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} style={{ flex: 1 }}>
                  <option value="">或合并为已有品项的别名…</option>
                  {items.filter((i) => i.is_active).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <button className="btn" disabled={!mergeTarget} onClick={mergeIntoExisting}>合并</button>
              </div>
            </div>
          )}
        </section>
      )}

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? "编辑品项" : "新建品项"}>
        {form && (
          <>
            <div className="field"><label>品名</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field" style={{ marginTop: 8 }}><label>别名（顿号/逗号分隔，用于 OCR 与下单匹配）</label><input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} /></div>
            <div className="grid" style={{ marginTop: 8 }}>
              <div className="field"><label>品类</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </div>
              <div className="field"><label>储位</label>
                <select value={form.storage_location} onChange={(e) => setForm({ ...form, storage_location: e.target.value })}>{locations.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </div>
              <div className="field"><label>基准单位（盘点/计价）</label><input value={form.base_unit} onChange={(e) => setForm({ ...form, base_unit: e.target.value })} placeholder="千克 / 个 / 瓶" /></div>
              <div className="field"><label>安全库存（可选）</label><input inputMode="decimal" value={form.par_level} onChange={(e) => setForm({ ...form, par_level: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>默认供应商</label>
                <select value={form.default_supplier_id} onChange={(e) => setForm({ ...form, default_supplier_id: e.target.value })}>
                  <option value="">无</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>其他单位换算（如 1 箱 = 10 千克；克/千克/斤之间自动换算）</label>
              {form.units.map((u, idx) => (
                <div key={idx} className="row" style={{ flexWrap: "nowrap" }}>
                  <span>1</span>
                  <input value={u.unit} onChange={(e) => setForm({ ...form, units: form.units.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)) })} placeholder="箱" />
                  <span>=</span>
                  <input inputMode="decimal" value={u.factor_to_base} onChange={(e) => setForm({ ...form, units: form.units.map((x, i) => (i === idx ? { ...x, factor_to_base: e.target.value } : x)) })} placeholder="10" />
                  <span>{form.base_unit}</span>
                  <button className="btn danger" onClick={() => setForm({ ...form, units: form.units.filter((_, i) => i !== idx) })}>×</button>
                </div>
              ))}
              <button className="btn secondary" onClick={() => setForm({ ...form, units: [...form.units, { unit: "", factor_to_base: "" }] })}>+ 添加换算</button>
            </div>
            {form.id && (
              <label className="row" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} style={{ width: "auto" }} /> 启用
              </label>
            )}
            <button className="big-btn" style={{ width: "100%", marginTop: 12 }} onClick={saveForm}>保存</button>
          </>
        )}
      </Modal>

      <Modal open={Boolean(prices)} onClose={() => setPrices(null)} title={`价格历史：${prices?.item.name || ""}`}>
        {prices && (
          <>
            <p>最新进价：<b>{prices.latest ? `${money(prices.latest.base_unit_price)}/${prices.item.base_unit}` : "暂无"}</b>{prices.latest ? `（${prices.latest.date} ${prices.latest.supplier_name}）` : ""}</p>
            <div className="scroll-x">
              <table className="table">
                <thead><tr><th>日期</th><th>供应商</th><th className="num">单价</th><th className="num">基准价</th><th className="num">合格量</th></tr></thead>
                <tbody>
                  {prices.rows.map((r) => (
                    <tr key={r.receiving_item_id}>
                      <td>{r.date}</td><td>{r.supplier_name}</td>
                      <td className="num">{money(r.unit_price)}/{r.unit}</td>
                      <td className="num">{r.base_unit_price === null ? "-" : `${money(r.base_unit_price)}/${prices.item.base_unit}`}</td>
                      <td className="num">{r.accepted_quantity}{r.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

export default function ItemsPage() {
  return <OpsShell title="品项主档" minRole="CHEF">{() => <ItemsView />}</OpsShell>;
}
