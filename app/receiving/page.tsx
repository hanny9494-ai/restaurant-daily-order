"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OpsShell, STATUS_LABEL } from "@/components/ops/StaffGate";
import { api, errorMessage, localToday, money, roleAtLeast } from "@/lib/ops/client";
import type { StaffSession } from "@/lib/ops/client";

type BoardSupplier = {
  supplier_id: number;
  supplier_name: string;
  status: string;
  sent_at: string | null;
  sent_by: string | null;
  received_at: string | null;
  received_by: string | null;
  reviewed_by: string | null;
  has_discrepancy: boolean;
  invoice_total: number | null;
  system_total: number | null;
  accepted_total: number;
  line_count: number;
  received_line_count: number;
  missing_items: string[];
  open_discrepancies: number;
};

type Board = {
  date: string;
  is_locked: boolean;
  locked_at: string | null;
  reviewed_by: string | null;
  all_received: boolean;
  open_discrepancies_total: number;
  suppliers: BoardSupplier[];
  lock_logs: Array<{ id: number; action: string; actor_name: string; reason: string | null; created_at: string }>;
};

function BoardView({ session }: { session: StaffSession }) {
  const [date, setDate] = useState(localToday());
  const [board, setBoard] = useState<Board | null>(null);
  const [allSuppliers, setAllSuppliers] = useState<Array<{ id: number; name: string }>>([]);
  const [adhocSupplier, setAdhocSupplier] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canReview = roleAtLeast(session.staff.role, "CHEF");

  async function load() {
    setError("");
    try {
      const res = await api<{ data: Board }>(`/api/supplier-orders?date=${date}`);
      setBoard(res.data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    load();
  }, [date]);

  useEffect(() => {
    api<{ data: Array<{ id: number; name: string }> }>("/api/suppliers").then((r) => setAllSuppliers(r.data)).catch(() => {});
  }, []);

  async function lockDay() {
    if (!window.confirm(`确认复核并锁定 ${date} 的全部收货？锁定后只能通过「事后退货」调整。`)) return;
    setBusy(true);
    try {
      const res = await api<{ data: Board }>("/api/receiving/review", { body: { date } });
      setBoard(res.data);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function unlockDay() {
    const reason = window.prompt("解锁原因（必填，会记录操作人）")?.trim();
    if (!reason) return;
    setBusy(true);
    try {
      const res = await api<{ data: Board }>("/api/receiving/review/unlock", { body: { date, reason } });
      setBoard(res.data);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const notArrived = board?.suppliers.filter((s) => s.status === "PENDING_SEND" || s.status === "SENT") || [];

  return (
    <>
      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200 }} />
          <button className="btn secondary" onClick={load}>刷新</button>
        </div>
        {board && (
          <div className="stat-grid" style={{ marginTop: 10 }}>
            <div className="stat"><div className="label">供应商</div><div className="value">{board.suppliers.length}</div></div>
            <div className="stat"><div className="label">未到货</div><div className="value">{notArrived.length}</div></div>
            <div className="stat"><div className="label">待处理差异</div><div className="value" style={{ color: board.open_discrepancies_total ? "#b42318" : undefined }}>{board.open_discrepancies_total}</div></div>
            <div className="stat"><div className="label">当日状态</div><div className="value" style={{ fontSize: 16 }}>{board.is_locked ? `已锁定 · ${board.reviewed_by || ""}` : board.all_received ? "待复核" : "收货中"}</div></div>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
      </section>

      {board && board.suppliers.length === 0 && (
        <section className="card"><p className="muted">当天没有下单记录。补送或临时来货可在下方选择供应商收货。</p></section>
      )}

      {board?.suppliers.map((s) => {
        const st = STATUS_LABEL[s.status] || { text: s.status, cls: "" };
        return (
          <Link key={s.supplier_id} href={`/receiving/supplier?date=${date}&supplier_id=${s.supplier_id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className={`line-card ${s.open_discrepancies ? "flag" : ""}`}>
              <div className="line-head">
                <div className="line-title">{s.supplier_name}</div>
                <span className={`badge ${st.cls}`}>{st.text}</span>
              </div>
              <div className="kv">
                <span>品项 <b>{s.received_line_count}/{s.line_count}</b></span>
                {s.sent_by && <span>发送 <b>{s.sent_by}</b></span>}
                {s.received_by && <span>收货 <b>{s.received_by}</b></span>}
                {s.status !== "PENDING_SEND" && s.status !== "SENT" && <span>合格金额 <b>{money(s.accepted_total)}</b></span>}
                {s.invoice_total !== null && <span>单据 <b>{money(s.invoice_total)}</b> / 系统 <b>{money(s.system_total)}</b></span>}
              </div>
              {s.missing_items.length > 0 && (
                <div className="muted" style={{ fontSize: 13 }}>
                  {s.status === "PENDING_SEND" || s.status === "SENT" ? "未到货：" : "缺货："}{s.missing_items.join("、")}
                </div>
              )}
              {s.open_discrepancies > 0 && <span className="badge bad" style={{ marginTop: 6 }}>待处理差异 {s.open_discrepancies}</span>}
            </div>
          </Link>
        );
      })}

      <section className="card">
        <h3>补送 / 临时来货</h3>
        <div className="row">
          <select value={adhocSupplier} onChange={(e) => setAdhocSupplier(e.target.value)} style={{ flex: 1 }}>
            <option value="">选择供应商</option>
            {allSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Link className="btn" href={adhocSupplier ? `/receiving/supplier?date=${date}&supplier_id=${adhocSupplier}` : "#"}>去收货</Link>
        </div>
      </section>

      {board && board.lock_logs.length > 0 && (
        <section className="card">
          <h3>锁定记录</h3>
          {board.lock_logs.map((l) => (
            <div key={l.id} className="muted" style={{ fontSize: 13 }}>
              {l.created_at} · {l.action === "LOCK" ? "锁定" : "解锁"} · {l.actor_name}{l.reason ? ` · 原因：${l.reason}` : ""}
            </div>
          ))}
        </section>
      )}

      {board && canReview && (
        <div className="sticky-actions">
          {board.is_locked ? (
            <button className="big-btn danger" disabled={busy} onClick={unlockDay}>解锁（需填原因）</button>
          ) : (
            <button className="big-btn ok" disabled={busy || !board.all_received} onClick={lockDay}>
              {board.all_received ? "复核并锁定当天" : "全部供应商收货后可复核锁定"}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export default function ReceivingBoardPage() {
  return <OpsShell title="今日收货看板">{(session) => <BoardView session={session} />}</OpsShell>;
}
