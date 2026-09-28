"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DISC_STATUS_LABEL, DISC_TYPE_LABEL, Modal, OpsShell } from "@/components/ops/StaffGate";
import { api, errorMessage, money, qty, roleAtLeast } from "@/lib/ops/client";
import type { StaffSession } from "@/lib/ops/client";

const RESOLUTION_OPTIONS = [
  { value: "RESOLVED_RESENT", label: "已补送" },
  { value: "RESOLVED_RETURNED", label: "已退回供应商" },
  { value: "RESOLVED_DEDUCTED", label: "扣款/按实结算" }
];

function DiscrepancyView({ session }: { session: StaffSession }) {
  const [filter, setFilter] = useState<"OPEN" | "UNSETTLED" | "ALL">("OPEN");
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [resolving, setResolving] = useState<any | null>(null);
  const [form, setForm] = useState({ resolution: "RESOLVED_DEDUCTED", note: "", adjustment: "" });
  const [error, setError] = useState("");
  const canResolve = roleAtLeast(session.staff.role, "CHEF");
  const canSettle = roleAtLeast(session.staff.role, "MANAGER");

  async function load() {
    setError("");
    const qs = new URLSearchParams();
    if (filter === "OPEN") qs.set("status", "OPEN");
    if (filter === "UNSETTLED") qs.set("unsettled", "1");
    if (supplierId) qs.set("supplier_id", supplierId);
    try {
      const res = await api<{ data: any[] }>(`/api/discrepancies?${qs.toString()}`);
      setRows(res.data);
      setSelected(new Set());
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    load();
  }, [filter, supplierId]);

  useEffect(() => {
    api<{ data: Array<{ id: number; name: string }> }>("/api/suppliers?include_inactive=1").then((r) => setSuppliers(r.data)).catch(() => {});
  }, []);

  async function resolve() {
    if (!resolving) return;
    try {
      await api(`/api/discrepancies/${resolving.id}/resolve`, {
        body: { resolution: form.resolution, note: form.note, adjustment_amount: form.adjustment === "" ? null : Number(form.adjustment) }
      });
      setResolving(null);
      await load();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function settle() {
    if (selected.size === 0) return;
    if (!window.confirm(`确认将 ${selected.size} 条已处理差异标记为已结算？`)) return;
    try {
      const res = await api<{ data: { settled: number[]; skipped: any[] } }>("/api/discrepancies/settle", { body: { ids: Array.from(selected) } });
      alert(`已结算 ${res.data.settled.length} 条${res.data.skipped.length ? `，跳过 ${res.data.skipped.length} 条（仍待处理）` : ""}`);
      await load();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <section className="card">
        <div className="seg">
          <button className={filter === "OPEN" ? "active" : ""} onClick={() => setFilter("OPEN")}>待处理</button>
          <button className={filter === "UNSETTLED" ? "active" : ""} onClick={() => setFilter("UNSETTLED")}>未结算</button>
          <button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>全部</button>
        </div>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={{ marginTop: 8 }}>
          <option value="">全部供应商</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <p className="muted" style={{ marginTop: 8 }}>事后退货 / 换货：在收货看板进入对应日期的供应商，点收货行的「事后退货 / 换货」（已锁定日期也可以）。</p>
        {error && <p className="error-text">{error}</p>}
      </section>

      {rows.length === 0 && <p className="muted">没有记录。</p>}
      {rows.map((d) => {
        const st = DISC_STATUS_LABEL[d.status] || { text: d.status, cls: "" };
        return (
          <div key={d.id} className={`line-card ${d.status === "OPEN" ? "flag" : ""}`}>
            <div className="line-head">
              <div>
                <div className="line-title">{d.item_name} · {DISC_TYPE_LABEL[d.type] || d.type}</div>
                <div className="muted" style={{ fontSize: 13 }}>#{d.id} · {d.supplier_name} · 收货日 {d.date}{d.effective_date !== d.date ? ` · 入账 ${d.effective_date}` : ""}</div>
              </div>
              <span className={`badge ${st.cls}`}>{st.text}</span>
            </div>
            <div className="kv">
              <span>数量 <b>{qty(d.quantity)}{d.unit}</b></span>
              {d.unit_price !== null && <span>单价 <b>{money(d.unit_price)}</b></span>}
              {d.expected_unit_price !== null && <span>参考价 <b>{money(d.expected_unit_price)}</b></span>}
              <span>差异金额 <b>{money(d.amount)}</b></span>
              {d.adjustment_amount !== 0 && <span>应付调整 <b style={{ color: "#b42318" }}>{money(d.adjustment_amount)}</b></span>}
            </div>
            {d.reason && <div className="muted">原因：{d.reason}</div>}
            {d.resolution_note && <div className="muted">处理：{d.resolution_note}（{d.resolved_by}）</div>}
            <div className="row" style={{ marginTop: 8 }}>
              {d.photo_url && <a className="btn secondary" href={d.photo_url} target="_blank" rel="noreferrer">照片</a>}
              <Link className="btn secondary" href={`/receiving/supplier?date=${d.date}&supplier_id=${d.supplier_id}`}>收货记录</Link>
              {d.status === "OPEN" && canResolve && (
                <button className="btn" onClick={() => { setResolving(d); setForm({ resolution: d.type === "SHORT" ? "RESOLVED_RESENT" : "RESOLVED_DEDUCTED", note: "", adjustment: "" }); }}>处理</button>
              )}
              {canSettle && d.status !== "OPEN" && d.status !== "SETTLED" && (
                <label className="btn secondary" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} style={{ width: "auto", marginRight: 6 }} />
                  选中结算
                </label>
              )}
            </div>
          </div>
        );
      })}

      {canSettle && selected.size > 0 && (
        <div className="sticky-actions">
          <button className="big-btn" onClick={settle}>标记 {selected.size} 条为已结算</button>
        </div>
      )}

      <Modal open={Boolean(resolving)} onClose={() => setResolving(null)} title={`处理差异 #${resolving?.id || ""}`}>
        <div className="seg">
          {RESOLUTION_OPTIONS.map((o) => (
            <button key={o.value} className={form.resolution === o.value ? "active" : ""} onClick={() => setForm({ ...form, resolution: o.value })}>{o.label}</button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          单价差异选「扣款」默认调整 −差价；多送选「已退回」默认调整 −多送金额；短缺/拒收已按实收入账，一般无需调整。
        </p>
        <div className="field" style={{ marginTop: 8 }}>
          <label>应付调整金额（留空=默认）</label>
          <input inputMode="decimal" value={form.adjustment} onChange={(e) => setForm({ ...form, adjustment: e.target.value })} placeholder="负数=少付" />
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>处理说明</label>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <button className="big-btn" style={{ width: "100%", marginTop: 12 }} onClick={resolve}>确认处理</button>
      </Modal>
    </>
  );
}

export default function DiscrepanciesPage() {
  return <OpsShell title="差异单">{(s) => <DiscrepancyView session={s} />}</OpsShell>;
}
