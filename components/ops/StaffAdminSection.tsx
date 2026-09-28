"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StaffLoginPanel, useStaffSession } from "@/components/ops/StaffGate";
import { api, errorMessage, roleAtLeast, ROLE_LABEL, saveSession } from "@/lib/ops/client";
import type { StaffRole } from "@/lib/ops/client";

type StaffRow = { id: number; name: string; role: StaffRole; is_active: number };
const ROLES: StaffRole[] = ["RECEIVER", "CHEF", "MANAGER", "ADMIN"];
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** Staff (name + personal PIN + role) and ops settings, embedded in /dashboard/manage. */
export default function StaffAdminSection() {
  const { session, ready } = useStaffSession();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [form, setForm] = useState({ name: "", pin: "", role: "RECEIVER" as StaffRole });
  const [settings, setSettings] = useState<any | null>(null);
  const [error, setError] = useState("");
  const isManager = roleAtLeast(session?.staff.role, "MANAGER");
  const isAdmin = roleAtLeast(session?.staff.role, "ADMIN");

  async function load() {
    if (!isManager) return;
    try {
      const [s, c] = await Promise.all([api<{ data: StaffRow[] }>("/api/staff?all=1"), api<{ data: any }>("/api/ops/settings")]);
      setStaff(s.data);
      setSettings(c.data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    load();
  }, [session?.token]);

  async function create() {
    try {
      await api("/api/staff", { body: form });
      setForm({ name: "", pin: "", role: "RECEIVER" });
      await load();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function patch(id: number, body: any) {
    try {
      await api(`/api/staff/${id}`, { method: "PATCH", body });
      await load();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function saveSettings(body: any) {
    try {
      await api("/api/ops/settings", { method: "PATCH", body });
      await load();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  if (!ready) return null;
  return (
    <section className="card">
      <h2>员工与收货设置</h2>
      {!session ? (
        <StaffLoginPanel />
      ) : !isManager ? (
        <>
          <p className="muted">当前登录：{session.staff.name}（{ROLE_LABEL[session.staff.role]}）。员工管理需要店长或管理员。</p>
          <button className="btn secondary" onClick={() => saveSession(null)}>换人登录</button>
        </>
      ) : (
        <>
          <p className="muted">当前登录：{session.staff.name}（{ROLE_LABEL[session.staff.role]}） · <Link href="/items">品项主档</Link> · <Link href="/receiving">收货看板</Link></p>
          {error && <p className="error-text">{error}</p>}
          <div className="grid" style={{ marginTop: 8 }}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="员工姓名" />
            <input value={form.pin} inputMode="numeric" onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })} placeholder="个人 PIN（4-8 位）" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}>
              {ROLES.filter((r) => isAdmin || r !== "ADMIN").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <button className="btn" disabled={!form.name || form.pin.length < 4} onClick={create}>添加员工</button>
          </div>
          <table className="table" style={{ marginTop: 10 }}>
            <thead><tr><th>姓名</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    <select value={s.role} disabled={s.role === "ADMIN" && !isAdmin} onChange={(e) => patch(s.id, { role: e.target.value })}>
                      {ROLES.filter((r) => isAdmin || r !== "ADMIN" || s.role === "ADMIN").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td>{s.is_active ? "在职" : "停用"}</td>
                  <td>
                    <div className="row">
                      <button className="btn secondary" onClick={() => {
                        const pin = window.prompt(`为 ${s.name} 设置新 PIN（4-8 位数字）`)?.trim();
                        if (pin) patch(s.id, { pin });
                      }}>重置 PIN</button>
                      <button className={s.is_active ? "btn danger" : "btn secondary"} onClick={() => patch(s.id, { is_active: s.is_active ? 0 : 1 })}>
                        {s.is_active ? "停用" : "启用"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {settings && (
            <div style={{ marginTop: 14 }}>
              <h3>收货 / 盘点参数</h3>
              <p className="muted">门店：{settings.storeName} · 盘点口径：{settings.stocktakeTiming === "START_OF_DAY" ? "营业前" : "收市后"}（env STOCKTAKE_TIMING）{settings.ocr_mock_enabled ? " · OCR mock 已开启" : ""}</p>
              <div className="grid">
                <div className="field">
                  <label>单价偏差提醒阈值（当前 {Math.round(settings.priceDeviationThreshold * 100)}%）</label>
                  <select disabled={!isAdmin} value={String(settings.priceDeviationThreshold)} onChange={(e) => saveSettings({ price_deviation_threshold: Number(e.target.value) })}>
                    {[0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5].concat([settings.priceDeviationThreshold]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map((v) => (
                      <option key={v} value={String(v)}>{Math.round(v * 100)}%</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>每周固定盘点日</label>
                  <select disabled={!isAdmin} value={String(settings.stocktakeWeekday)} onChange={(e) => saveSettings({ stocktake_weekday: Number(e.target.value) })}>
                    {WEEKDAYS.map((w, i) => <option key={w} value={String(i)}>{w}</option>)}
                  </select>
                </div>
              </div>
              {!isAdmin && <p className="muted">参数修改需要管理员。</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
