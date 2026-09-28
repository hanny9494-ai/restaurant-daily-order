"use client";

import { useEffect, useState } from "react";
import { DISC_STATUS_LABEL, DISC_TYPE_LABEL, OpsShell } from "@/components/ops/StaffGate";
import { api, downloadWithAuth, errorMessage, localToday, money, qty } from "@/lib/ops/client";

function monthStart() {
  const t = localToday();
  return `${t.slice(0, 8)}01`;
}

function ReconciliationView() {
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>([]);
  const [supplierId, setSupplierId] = useState("");
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(localToday());
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ data: Array<{ id: number; name: string }> }>("/api/suppliers?include_inactive=1").then((r) => setSuppliers(r.data)).catch(() => {});
  }, []);

  function qs() {
    const p = new URLSearchParams({ start, end });
    if (supplierId) p.set("supplier_id", supplierId);
    return p.toString();
  }

  async function query() {
    setError("");
    try {
      const res = await api<{ data: any }>(`/api/reconciliation?${qs()}`);
      setData(res.data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function exportXlsx() {
    const name = suppliers.find((s) => String(s.id) === supplierId)?.name || "全部供应商";
    try {
      await downloadWithAuth(`/api/reconciliation/export?${qs()}`, `对账_${name}_${start}_${end}.xlsx`);
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  return (
    <>
      <section className="card">
        <div className="field">
          <label>供应商</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">全部供应商</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          <div className="field"><label>开始</label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="field"><label>结束</label><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="big-btn" onClick={query}>查询</button>
          <button className="big-btn secondary" onClick={exportXlsx}>导出对账 Excel</button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>

      {data && (
        <>
          <div className="stat-grid">
            <div className="stat"><div className="label">实收合格金额</div><div className="value">{money(data.totals.received_amount)}</div></div>
            <div className="stat"><div className="label">退货红冲</div><div className="value">{money(data.totals.returns)}</div></div>
            <div className="stat"><div className="label">调整</div><div className="value">{money(data.totals.adjustments)}</div></div>
            <div className="stat"><div className="label">应付</div><div className="value">{money(data.totals.payable)}</div></div>
          </div>
          <p className="muted" style={{ marginTop: 6 }}>应付 = Σ(实收合格数量 × 单价) − 退货红冲 ± 调整</p>

          <section className="card scroll-x" style={{ marginTop: 12 }}>
            <h3>按日汇总</h3>
            <table className="table">
              <thead><tr><th>日期</th><th>供应商</th><th className="num">实收</th><th className="num">红冲</th><th className="num">调整</th><th className="num">应付</th><th className="num">单据</th></tr></thead>
              <tbody>
                {data.daily.map((d: any) => (
                  <tr key={`${d.date}-${d.supplier_id}`}>
                    <td>{d.date}</td><td>{d.supplier_name}</td>
                    <td className="num">{money(d.received_amount)}</td><td className="num">{money(d.returns)}</td>
                    <td className="num">{money(d.adjustments)}</td><td className="num"><b>{money(d.payable)}</b></td>
                    <td className="num">{money(d.invoice_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h3>未结差异（{data.open_discrepancies.length}）</h3>
            {data.open_discrepancies.map((d: any) => (
              <div key={d.id} className="row" style={{ justifyContent: "space-between", borderBottom: "1px solid #f0f0f0", padding: "6px 0" }}>
                <span>#{d.id} {d.date} {d.supplier_name} {d.item_name} · {DISC_TYPE_LABEL[d.type]} {qty(d.quantity)}{d.unit} · {money(d.amount)}</span>
                <span className={`badge ${(DISC_STATUS_LABEL[d.status] || { cls: "" }).cls}`}>{(DISC_STATUS_LABEL[d.status] || { text: d.status }).text}</span>
              </div>
            ))}
          </section>

          <section className="card">
            <h3>单据图片（{data.scans.length}）</h3>
            <div className="thumbs">
              {data.scans.map((s: any) => (
                <a key={s.id} href={s.file_url} target="_blank" rel="noreferrer" title={`${s.service_date} ${s.supplier_name || ""}`}><img src={s.file_url} alt="单据" /></a>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

export default function ReconciliationPage() {
  return <OpsShell title="供应商对账" minRole="CHEF">{() => <ReconciliationView />}</OpsShell>;
}
