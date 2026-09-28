"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OpsShell } from "@/components/ops/StaffGate";
import { api, errorMessage, money, qty, roleAtLeast } from "@/lib/ops/client";
import type { StaffSession } from "@/lib/ops/client";

type Line = {
  item_id: number;
  item_name: string;
  category: string;
  storage_location: string;
  base_unit: string;
  quantity: number | null;
  input_quantity: number | null;
  input_unit: string | null;
  prev_quantity: number | null;
  estimated_unit_price: number | null;
  estimated_value: number | null;
  counted_by: string | null;
  unit_options: string[];
};

type Entry = { value: string; unit: string };

function CountView({ session }: { session: StaffSession }) {
  const params = useSearchParams();
  const id = Number(params.get("id"));
  const [st, setSt] = useState<any | null>(null);
  const [location, setLocation] = useState("");
  const [onlyUncounted, setOnlyUncounted] = useState(false);
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const [changed, setChanged] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isChef = roleAtLeast(session.staff.role, "CHEF");

  function applyStocktake(data: any, keepChanged: boolean) {
    setSt(data);
    setEntries((prev) => {
      const out: Record<number, Entry> = {};
      for (const l of data.lines as Line[]) {
        out[l.item_id] = keepChanged && changed.has(l.item_id) && prev[l.item_id]
          ? prev[l.item_id]
          : { value: l.input_quantity === null ? "" : String(l.input_quantity), unit: l.input_unit || l.base_unit };
      }
      return out;
    });
    if (!keepChanged) setChanged(new Set());
    if (!location && data.locations.length > 0) setLocation(data.locations[0]);
  }

  async function load(keepChanged = false) {
    try {
      const res = await api<{ data: any }>(`/api/stocktakes/${id}`);
      applyStocktake(res.data, keepChanged);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    if (id) load();
  }, [id]);

  const editable = st && (st.status === "DRAFT" || st.status === "COUNTING");
  const lines: Line[] = useMemo(() => {
    if (!st) return [];
    return (st.lines as Line[]).filter((l) => (!location || l.storage_location === location) && (!onlyUncounted || l.quantity === null));
  }, [st, location, onlyUncounted]);

  function setEntry(itemId: number, patch: Partial<Entry>) {
    setEntries((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
    setChanged((prev) => new Set(prev).add(itemId));
  }

  async function saveChanged() {
    if (changed.size === 0) return true;
    setBusy(true);
    try {
      const counts = Array.from(changed).map((itemId) => {
        const e = entries[itemId];
        return { item_id: itemId, input_quantity: e.value === "" ? null : Number(e.value), input_unit: e.unit };
      });
      const res = await api<{ data: { stocktake: any } }>(`/api/stocktakes/${id}/counts`, { body: { counts } });
      setChanged(new Set());
      applyStocktake(res.data.stocktake, false);
      return true;
    } catch (e) {
      alert(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!(await saveChanged())) return;
    try {
      const res = await api<{ data: any }>(`/api/stocktakes/${id}/submit`, { body: {} });
      applyStocktake(res.data, false);
    } catch (e: any) {
      if (e?.message === "UNCOUNTED_ITEMS") {
        const names = (e.detail?.uncounted || []).map((u: any) => u.item_name);
        if (window.confirm(`还有 ${names.length} 个品项未盘：\n${names.slice(0, 20).join("、")}${names.length > 20 ? "…" : ""}\n\n未盘品项按「未盘」处理（不计 0，也不计金额）。仍要提交？`)) {
          const res = await api<{ data: any }>(`/api/stocktakes/${id}/submit`, { body: { allow_uncounted: true } });
          applyStocktake(res.data, false);
        }
      } else {
        alert(errorMessage(e));
      }
    }
  }

  async function action(path: "approve" | "reopen") {
    if (path === "approve" && !window.confirm("审核通过后锁定盘点，按当日最新进价快照库存金额。确认？")) return;
    try {
      const res = await api<{ data: any }>(`/api/stocktakes/${id}/${path}`, { body: {} });
      applyStocktake(res.data, false);
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  if (!id) return <p className="error-text">缺少盘点 id</p>;
  if (!st) return <p className="muted">{error || "加载中..."}</p>;
  const countedAll = (st.lines as Line[]).filter((l) => l.quantity !== null).length;

  return (
    <>
      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0 }}>{st.stocktake_date} 盘点</h2>
            <div className="muted">已盘 {countedAll}/{st.lines.length} · 估算金额 {money(st.status === "APPROVED" ? st.total_value : st.estimated_total)}</div>
          </div>
          <span className={`badge ${({ DRAFT: "", COUNTING: "info", SUBMITTED: "warn", APPROVED: "ok" } as Record<string, string>)[st.status] || ""}`}>{({ DRAFT: "草稿", COUNTING: "盘点中", SUBMITTED: "待审核", APPROVED: "已审核" } as Record<string, string>)[st.status] || st.status}</span>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <Link className="btn secondary" href="/stocktake">← 列表</Link>
          <button className="btn secondary" onClick={() => load(true)}>刷新（看别人盘的）</button>
        </div>
      </section>

      <div className="ops-nav" style={{ borderRadius: 10, marginBottom: 8 }}>
        {st.locations.map((loc: string) => {
          const all = (st.lines as Line[]).filter((l) => l.storage_location === loc);
          const done = all.filter((l) => l.quantity !== null).length;
          return (
            <a key={loc} className={location === loc ? "active" : ""} onClick={() => setLocation(loc)} style={{ cursor: "pointer" }}>
              {loc} {done}/{all.length}
            </a>
          );
        })}
        <a className={onlyUncounted ? "active" : ""} onClick={() => setOnlyUncounted(!onlyUncounted)} style={{ cursor: "pointer" }}>只看未盘</a>
      </div>

      {lines.map((l) => {
        const e = entries[l.item_id] || { value: "", unit: l.base_unit };
        const isChanged = changed.has(l.item_id);
        return (
          <div key={l.item_id} className={`line-card ${l.quantity === null && !isChanged ? "" : ""}`}>
            <div className="line-head">
              <div>
                <div className="line-title">{l.item_name}</div>
                <div className="muted" style={{ fontSize: 13 }}>{l.category} · 上次 {l.prev_quantity === null ? "-" : `${qty(l.prev_quantity)}${l.base_unit}`}</div>
              </div>
              {l.quantity === null ? <span className="badge">未盘</span> : <span className="badge ok">{qty(l.quantity)}{l.base_unit}</span>}
            </div>
            {editable ? (
              <div className="row" style={{ flexWrap: "nowrap", marginTop: 6 }}>
                <input
                  inputMode="decimal"
                  value={e.value}
                  onChange={(ev) => setEntry(l.item_id, { value: ev.target.value })}
                  placeholder="空=未盘"
                  style={{ fontSize: 18, minHeight: 48 }}
                />
                <select value={e.unit} onChange={(ev) => setEntry(l.item_id, { unit: ev.target.value })} style={{ maxWidth: 110, minHeight: 48 }}>
                  {l.unit_options.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <button className="btn secondary" style={{ minHeight: 48 }} onClick={() => setEntry(l.item_id, { value: "0" })}>0</button>
              </div>
            ) : (
              <div className="kv">
                {l.input_unit && l.input_unit !== l.base_unit && <span>录入 <b>{qty(l.input_quantity)}{l.input_unit}</b></span>}
                <span>单价 <b>{money(l.estimated_unit_price)}</b></span>
                <span>金额 <b>{money(l.estimated_value)}</b></span>
                {l.counted_by && <span>盘点人 <b>{l.counted_by}</b></span>}
              </div>
            )}
          </div>
        );
      })}

      <div className="sticky-actions">
        {editable && (
          <>
            <button className="big-btn secondary" disabled={busy || changed.size === 0} onClick={saveChanged}>保存（{changed.size}）</button>
            <button className="big-btn" disabled={busy} onClick={submit}>提交盘点</button>
          </>
        )}
        {st.status === "SUBMITTED" && isChef && (
          <>
            <button className="big-btn secondary" onClick={() => action("reopen")}>退回重盘</button>
            <button className="big-btn ok" onClick={() => action("approve")}>审核通过</button>
          </>
        )}
        {st.status === "SUBMITTED" && !isChef && <span className="muted">已提交，等待厨师长/店长审核</span>}
        {st.status === "APPROVED" && <span className="muted">已审核锁定 · {st.approved_by} · 库存金额 {money(st.total_value)}</span>}
      </div>
    </>
  );
}

export default function StocktakeCountPage() {
  return (
    <OpsShell title="盘点录入">
      {(s) => (
        <Suspense fallback={<p className="muted">加载中...</p>}>
          <CountView session={s} />
        </Suspense>
      )}
    </OpsShell>
  );
}
