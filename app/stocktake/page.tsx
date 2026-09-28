"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OpsShell } from "@/components/ops/StaffGate";
import { api, errorMessage, localToday, money, roleAtLeast } from "@/lib/ops/client";
import type { StaffSession } from "@/lib/ops/client";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const ST_LABEL: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: "草稿", cls: "" },
  COUNTING: { text: "盘点中", cls: "info" },
  SUBMITTED: { text: "待审核", cls: "warn" },
  APPROVED: { text: "已审核", cls: "ok" }
};

function StocktakeList({ session }: { session: StaffSession }) {
  const [data, setData] = useState<any | null>(null);
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<"WEEKLY" | "ADHOC">("WEEKLY");
  const [error, setError] = useState("");
  const canCreate = roleAtLeast(session.staff.role, "CHEF");

  async function load() {
    try {
      const res = await api<{ data: any }>("/api/stocktakes");
      setData(res.data);
      setDate((d) => d || res.data.next_due_date || localToday());
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    try {
      const res = await api<{ data: { id: number } }>("/api/stocktakes", { body: { stocktake_date: date, kind } });
      window.location.href = `/stocktake/count?id=${res.data.id}`;
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  return (
    <>
      {data && (
        <section className="card">
          <div className="kv">
            <span>固定盘点日 <b>{WEEKDAYS[data.config.stocktake_weekday]}</b></span>
            <span>下次 <b>{data.next_due_date}</b></span>
            <span>口径 <b>{data.config.stocktake_timing === "START_OF_DAY" ? "营业前盘点" : "收市后盘点"}</b></span>
          </div>
          {data.is_due_today && <p className="ok-text">今天是盘点日。</p>}
        </section>
      )}
      {canCreate && (
        <section className="card">
          <h3>发起盘点</h3>
          <div className="grid">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="seg">
              <button className={kind === "WEEKLY" ? "active" : ""} onClick={() => setKind("WEEKLY")}>每周盘点</button>
              <button className={kind === "ADHOC" ? "active" : ""} onClick={() => setKind("ADHOC")}>临时盘点</button>
            </div>
          </div>
          <button className="big-btn" style={{ width: "100%", marginTop: 10 }} onClick={create}>开始盘点</button>
        </section>
      )}
      {error && <p className="error-text">{error}</p>}
      {data?.stocktakes.map((s: any) => {
        const st = ST_LABEL[s.status] || { text: s.status, cls: "" };
        return (
          <Link key={s.id} href={`/stocktake/count?id=${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="line-card">
              <div className="line-head">
                <div className="line-title">{s.stocktake_date} {s.kind === "ADHOC" ? "临时盘点" : "周盘点"}</div>
                <span className={`badge ${st.cls}`}>{st.text}</span>
              </div>
              <div className="kv">
                <span>已盘 <b>{s.counted_count}/{s.line_count}</b></span>
                {s.total_value !== null && <span>库存金额 <b>{money(s.total_value)}</b></span>}
                {s.approved_by && <span>审核 <b>{s.approved_by}</b></span>}
              </div>
            </div>
          </Link>
        );
      })}
    </>
  );
}

export default function StocktakePage() {
  return <OpsShell title="库存盘点">{(s) => <StocktakeList session={s} />}</OpsShell>;
}
