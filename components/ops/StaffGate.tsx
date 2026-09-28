"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, errorMessage, loadSession, roleAtLeast, ROLE_LABEL, saveSession } from "@/lib/ops/client";
import type { StaffRole, StaffSession } from "@/lib/ops/client";

type PublicStaff = { id: number; name: string; role: StaffRole };

const NAV: Array<{ href: string; label: string; min?: StaffRole }> = [
  { href: "/receiving", label: "收货看板" },
  { href: "/discrepancies", label: "差异单" },
  { href: "/stocktake", label: "盘点" },
  { href: "/reconciliation", label: "对账", min: "CHEF" },
  { href: "/cost", label: "食材成本", min: "CHEF" },
  { href: "/items", label: "品项主档", min: "CHEF" },
  { href: "/dashboard", label: "下单汇总" },
  { href: "/dashboard/manage", label: "设置", min: "MANAGER" }
];

export function useStaffSession() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setSession(loadSession());
    sync();
    setReady(true);
    window.addEventListener("ops-session-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("ops-session-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return { session, ready };
}

export function StaffLoginPanel({ onDone }: { onDone?: () => void }) {
  const [staff, setStaff] = useState<PublicStaff[]>([]);
  const [bootstrap, setBootstrap] = useState(false);
  const [picked, setPicked] = useState<PublicStaff | null>(null);
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await api<{ data: PublicStaff[]; bootstrap_required: boolean }>("/api/staff");
      setStaff(res.data);
      setBootstrap(res.bootstrap_required);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function doLogin(staffId: number, pinValue: string) {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ token: string; staff: PublicStaff; expires_in: number }>("/api/staff/login", {
        body: { staff_id: staffId, pin: pinValue }
      });
      saveSession({ token: res.token, staff: res.staff, exp: Date.now() + res.expires_in * 1000 });
      setPin("");
      setPicked(null);
      onDone?.();
    } catch (e) {
      setError(errorMessage(e));
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  async function doBootstrap() {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ data: PublicStaff }>("/api/staff", { body: { name, pin } });
      await doLogin(res.data.id, pin);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function press(d: string) {
    if (busy) return;
    if (d === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + d).slice(0, 8);
    setPin(next);
  }

  if (bootstrap) {
    return (
      <div>
        <h2>首次使用：创建管理员</h2>
        <p className="muted">新店第一个员工账号自动成为管理员（ADMIN），之后在「设置」里添加收货员 / 厨师长 / 店长。</p>
        <div className="field" style={{ marginTop: 10 }}>
          <label>姓名</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 张店长" />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>个人 PIN（4-8 位数字）</label>
          <input value={pin} inputMode="numeric" type="password" onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="big-btn" style={{ width: "100%", marginTop: 12 }} disabled={busy || !name || pin.length < 4} onClick={doBootstrap}>
          创建并登录
        </button>
      </div>
    );
  }

  if (!picked) {
    return (
      <div>
        <h2>谁在操作？</h2>
        <p className="muted">选择自己的名字，再输入个人 PIN。</p>
        <div className="btn-grid" style={{ marginTop: 12 }}>
          {staff.map((s) => (
            <button key={s.id} className="big-btn secondary" onClick={() => setPicked(s)}>
              {s.name}
              <div style={{ fontSize: 12, fontWeight: 400, color: "#666" }}>{ROLE_LABEL[s.role]}</div>
            </button>
          ))}
        </div>
        {staff.length === 0 && <p className="muted">暂无员工，请联系管理员在「设置」中添加。</p>}
        {error && <p className="error-text">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{picked.name}</h2>
        <button className="btn secondary" onClick={() => { setPicked(null); setPin(""); setError(""); }}>换人</button>
      </div>
      <div className="pin-dots">{"●".repeat(pin.length) || <span className="muted">输入 PIN</span>}</div>
      {error && <p className="error-text" style={{ textAlign: "center" }}>{error}</p>}
      <div className="pin-pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} onClick={() => press(d)}>{d}</button>
        ))}
        <button onClick={() => press("del")}>⌫</button>
        <button onClick={() => press("0")}>0</button>
        <button style={{ background: "#111", color: "#fff" }} disabled={busy || pin.length < 4} onClick={() => doLogin(picked.id, pin)}>OK</button>
      </div>
    </div>
  );
}

export function OpsShell({ title, children, minRole = "RECEIVER" }: { title: string; children: (session: StaffSession) => ReactNode; minRole?: StaffRole }) {
  const { session, ready } = useStaffSession();
  const pathname = usePathname();
  const role = session?.staff.role;
  return (
    <div style={{ minHeight: "100vh", background: "#f6f7f8" }}>
      <header className="ops-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ textDecoration: "none", fontWeight: 700 }}>⌂</Link>
          <strong>{title}</strong>
        </div>
        {session && (
          <div className="row" style={{ gap: 8 }}>
            <span className="who">{session.staff.name} · {ROLE_LABEL[session.staff.role]}</span>
            <button className="btn secondary" style={{ color: "#111", padding: "4px 10px" }} onClick={() => saveSession(null)}>退出</button>
          </div>
        )}
      </header>
      {session && (
        <nav className="ops-nav">
          {NAV.filter((n) => !n.min || roleAtLeast(role, n.min)).map((n) => (
            <Link key={n.href} href={n.href} className={pathname === n.href || (n.href !== "/dashboard" && pathname?.startsWith(`${n.href}/`)) ? "active" : ""}>
              {n.label}
            </Link>
          ))}
        </nav>
      )}
      <main className="ops-page">
        {!ready ? (
          <p className="muted">加载中...</p>
        ) : !session ? (
          <section className="card"><StaffLoginPanel /></section>
        ) : !roleAtLeast(session.staff.role, minRole) ? (
          <section className="card">
            <h2>无权限</h2>
            <p className="muted">此页面需要「{ROLE_LABEL[minRole]}」及以上角色，请换人登录。</p>
            <button className="big-btn secondary" onClick={() => saveSession(null)}>换人登录</button>
          </section>
        ) : (
          children(session)
        )}
      </main>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn secondary" onClick={onClose}>关闭</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  PENDING_SEND: { text: "待发送", cls: "" },
  SENT: { text: "已发送", cls: "info" },
  PARTIAL: { text: "部分收货", cls: "warn" },
  RECEIVED: { text: "已收货", cls: "ok" },
  REVIEWED: { text: "已复核", cls: "dark" }
};

export const DISC_TYPE_LABEL: Record<string, string> = {
  SHORT: "短缺/短斤",
  REJECT_ON_SITE: "当场拒收",
  RETURN_LATER: "事后退货",
  EXCHANGE: "换货(退+补)",
  OVER_DELIVERY: "多送",
  PRICE_MISMATCH: "单价差异"
};

export const DISC_STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  OPEN: { text: "待处理", cls: "bad" },
  RESOLVED_RESENT: { text: "已补送", cls: "ok" },
  RESOLVED_RETURNED: { text: "已退回", cls: "ok" },
  RESOLVED_DEDUCTED: { text: "已扣款", cls: "ok" },
  SETTLED: { text: "已结算", cls: "dark" }
};
