"use client";

import { useEffect, useState } from "react";
import { OpsShell } from "@/components/ops/StaffGate";
import { api, downloadWithAuth, errorMessage, localToday, money, pct, qty, roleAtLeast } from "@/lib/ops/client";
import type { StaffSession } from "@/lib/ops/client";

function CostView({ session }: { session: StaffSession }) {
  const [data, setData] = useState<any | null>(null);
  const [revenue, setRevenue] = useState<any[]>([]);
  const [form, setForm] = useState({ start_date: localToday(), end_date: localToday(), amount: "", note: "" });
  const [openIdx, setOpenIdx] = useState(0);
  const [error, setError] = useState("");
  const canDelete = roleAtLeast(session.staff.role, "MANAGER");

  async function load() {
    setError("");
    try {
      const [c, r] = await Promise.all([api<{ data: any }>("/api/cost"), api<{ data: any[] }>("/api/revenue")]);
      setData(c.data);
      setRevenue(r.data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function addRevenue() {
    try {
      await api("/api/revenue", { body: { ...form, amount: Number(form.amount) } });
      setForm({ ...form, amount: "", note: "" });
      await load();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function removeRevenue(id: number) {
    if (!window.confirm("删除这条营业额？")) return;
    try {
      await api(`/api/revenue/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function exportXlsx(endId?: number) {
    try {
      await downloadWithAuth(`/api/cost/export${endId ? `?end_stocktake_id=${endId}` : ""}`, `食材成本_${endId || "全部"}.xlsx`);
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  const maxRate = Math.max(0.0001, ...(data?.trend || []).map((t: any) => t.food_cost_rate || 0));

  return (
    <>
      <section className="card">
        <h3>营业额录入</h3>
        <p className="muted">按周或按天录入（开始=结束即单日）。计入两次盘点之间的营业额用于计算成本率，后续可对接 POS。</p>
        <div className="grid">
          <div className="field"><label>开始</label><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="field"><label>结束</label><input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          <div className="field"><label>营业额</label><input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="field"><label>备注</label><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        </div>
        <button className="big-btn" style={{ width: "100%", marginTop: 10 }} disabled={!form.amount} onClick={addRevenue}>保存营业额</button>
        {revenue.length > 0 && (
          <div className="scroll-x" style={{ marginTop: 10 }}>
            <table className="table">
              <thead><tr><th>期间</th><th className="num">营业额</th><th>录入</th><th /></tr></thead>
              <tbody>
                {revenue.slice(0, 20).map((r) => (
                  <tr key={r.id}>
                    <td>{r.start_date === r.end_date ? r.start_date : `${r.start_date} ~ ${r.end_date}`}</td>
                    <td className="num">{money(r.amount)}</td>
                    <td>{r.created_by}</td>
                    <td>{canDelete && <button className="btn danger" onClick={() => removeRevenue(r.id)}>删</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && <p className="error-text">{error}</p>}

      {data && (
        <>
          <section className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>成本率趋势</h3>
              <button className="btn secondary" onClick={() => exportXlsx()}>导出全部 Excel</button>
            </div>
            <p className="muted">期间 = 两次「已审核」盘点之间；食材成本 = 期初库存 + 本期采购 − 期末库存。</p>
            {data.trend.length === 0 && <p className="muted">至少需要两次已审核盘点。</p>}
            {data.trend.map((t: any) => (
              <div key={t.end_date} style={{ margin: "8px 0" }}>
                <div className="row" style={{ justifyContent: "space-between", fontSize: 14 }}>
                  <span>{t.start_date} ~ {t.end_date}</span>
                  <span>{money(t.food_cost)} / {money(t.revenue)} = <b>{pct(t.food_cost_rate)}</b></span>
                </div>
                <div className="bar" style={{ width: `${Math.max(2, ((t.food_cost_rate || 0) / maxRate) * 100)}%`, opacity: t.food_cost_rate === null ? 0.2 : 1 }} />
              </div>
            ))}
          </section>

          {data.periods.map((p: any, idx: number) => (
            <section key={p.end_stocktake_id} className="card">
              <div className="row" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpenIdx(openIdx === idx ? -1 : idx)}>
                <h3 style={{ margin: 0 }}>{p.start_date} ~ {p.end_date}</h3>
                <span className="badge dark">{pct(p.food_cost_rate)}</span>
              </div>
              <div className="stat-grid" style={{ marginTop: 8 }}>
                <div className="stat"><div className="label">期初库存</div><div className="value">{money(p.totals.opening)}</div></div>
                <div className="stat"><div className="label">本期采购</div><div className="value">{money(p.totals.purchases)}</div></div>
                <div className="stat"><div className="label">期末库存</div><div className="value">{money(p.totals.closing)}</div></div>
                <div className="stat"><div className="label">食材成本</div><div className="value">{money(p.food_cost)}</div></div>
                <div className="stat"><div className="label">营业额</div><div className="value">{money(p.revenue)}</div></div>
              </div>
              {p.partial_revenue_entries.length > 0 && <p className="error-text">有 {p.partial_revenue_entries.length} 条营业额跨越盘点期间，未计入。</p>}
              {openIdx === idx && (
                <>
                  <div className="scroll-x" style={{ marginTop: 10 }}>
                    <table className="table">
                      <thead><tr><th>品类</th><th className="num">期初</th><th className="num">采购</th><th className="num">期末</th><th className="num">消耗</th><th className="num">占比</th></tr></thead>
                      <tbody>
                        {p.categories.map((c: any) => (
                          <tr key={c.category}>
                            <td>{c.category}</td><td className="num">{money(c.opening)}</td><td className="num">{money(c.purchases)}</td>
                            <td className="num">{money(c.closing)}</td><td className="num"><b>{money(c.consumption)}</b></td><td className="num">{pct(c.share)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {p.anomalies.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <h4>消耗异常（较前 {Math.min(4, data.periods.length - 1 - idx)} 期均值偏差 &gt; {Math.round(data.config.anomaly_threshold * 100)}%）</h4>
                      {p.anomalies.map((a: any) => (
                        <div key={a.item_id} className="row" style={{ justifyContent: "space-between", fontSize: 14 }}>
                          <span>{a.item_name}</span>
                          <span>{qty(a.consumption)}{a.base_unit} vs 均值 {qty(a.avg_previous)} <b style={{ color: "#b42318" }}>{a.deviation > 0 ? "+" : ""}{pct(a.deviation)}</b></span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => exportXlsx(p.end_stocktake_id)}>导出本期 Excel</button>
                </>
              )}
            </section>
          ))}
        </>
      )}
    </>
  );
}

export default function CostPage() {
  return <OpsShell title="食材成本" minRole="CHEF">{(s) => <CostView session={s} />}</OpsShell>;
}
