"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import { formatAllSuppliersText, groupOrdersBySupplier, sortGroupsBySuppliers } from "@/lib/format";
import type { OrderItem, Supplier } from "@/lib/types";
import { Modal, STATUS_LABEL, StaffLoginPanel, useStaffSession } from "@/components/ops/StaffGate";
import { api, errorMessage, roleAtLeast } from "@/lib/ops/client";

const DASHBOARD_PIN_KEY = "dashboard_pin";

function todayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fallbackCopy(text: string) {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "true");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  el.setSelectionRange(0, text.length);
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  return ok;
}

export default function DashboardPage() {
  const router = useRouter();
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const today = useMemo(() => todayString(), []);

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pinReady, setPinReady] = useState(false);
  const [savedPin, setSavedPin] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [exportDate, setExportDate] = useState(today);
  const [exportStart, setExportStart] = useState(today);
  const [exportEnd, setExportEnd] = useState(today);
  const { session } = useStaffSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [orderStatus, setOrderStatus] = useState<Record<number, { status: string; sent_by: string | null }>>({});

  async function loadOrderStatus() {
    if (!session) return;
    try {
      const res = await api<{ data: { suppliers: Array<{ supplier_id: number; status: string; sent_by: string | null }> } }>(`/api/supplier-orders?date=${today}`);
      const map: Record<number, { status: string; sent_by: string | null }> = {};
      res.data.suppliers.forEach((s) => { map[s.supplier_id] = { status: s.status, sent_by: s.sent_by }; });
      setOrderStatus(map);
    } catch {
      setOrderStatus({});
    }
  }

  async function markSent(supplierIds: number[]) {
    if (!session) {
      setLoginOpen(true);
      return;
    }
    if (!roleAtLeast(session.staff.role, "CHEF")) {
      alert("需要厨师长 / 店长登录才能标记已发送");
      return;
    }
    try {
      await api("/api/supplier-orders/send", { body: { date: today, supplier_ids: supplierIds } });
      await loadOrderStatus();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function loadOrders() {
    const res = await fetch(`${apiBase}/api/order?date=${today}`);
    const json = await res.json();
    setOrders(json.data || []);
  }

  async function loadSuppliers() {
    const res = await fetch(`${apiBase}/api/suppliers?include_inactive=1`);
    const json = await res.json();
    setSuppliers(json.data || []);
  }

  useEffect(() => {
    const pin = localStorage.getItem(DASHBOARD_PIN_KEY) || "";
    setSavedPin(pin);
    setIsUnlocked(!pin);
    setPinReady(true);
  }, []);

  useEffect(() => {
    if (pinReady && isUnlocked) {
      loadOrders();
      loadSuppliers();
    }
  }, [pinReady, isUnlocked]);

  useEffect(() => {
    if (pinReady && isUnlocked && session) loadOrderStatus();
  }, [pinReady, isUnlocked, session, orders.length]);

  const grouped = useMemo(() => groupOrdersBySupplier(today, orders), [today, orders]);
  const groups = useMemo(() => sortGroupsBySuppliers(grouped, suppliers), [grouped, suppliers]);
  const allFormattedText = useMemo(() => formatAllSuppliersText(today, groups), [today, groups]);

  function verifyPin() {
    if (!savedPin) {
      setIsUnlocked(true);
      return;
    }

    if (pinInput === savedPin) {
      setIsUnlocked(true);
      setPinInput("");
      return;
    }

    alert("PIN 错误");
  }

  async function copyText(text: string) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        alert("已复制");
        return;
      } catch {
      }
    }

    const copied = fallbackCopy(text);
    alert(copied ? "已复制" : "复制失败，请手动长按文本复制");
  }

  function downloadByDate() {
    window.open(`${apiBase}/api/order/export?date=${encodeURIComponent(exportDate)}`, "_blank");
  }

  function downloadByRange() {
    window.open(
      `${apiBase}/api/order/export?start=${encodeURIComponent(exportStart)}&end=${encodeURIComponent(exportEnd)}`,
      "_blank"
    );
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1>/dashboard 汇总端</h1>
        <div className="row">
          {isUnlocked && (
            <button className="btn secondary" onClick={() => { loadOrders(); loadSuppliers(); }}>
              刷新
            </button>
          )}
          <button className="btn secondary" type="button" onClick={() => router.push("/dashboard/manage")}>管理设置</button>
          <button className="btn secondary" type="button" onClick={() => router.push("/receiving")}>收货看板</button>
          <button className="btn secondary" type="button" onClick={() => router.push("/order")}>去下单端</button>
        </div>
      </div>

      {!pinReady ? (
        <section className="card">
          <p className="muted">加载中...</p>
        </section>
      ) : !isUnlocked ? (
        <section className="card">
          <h2>输入 PIN 进入汇总端</h2>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="请输入 PIN"
              style={{ maxWidth: 240 }}
            />
            <button className="btn" type="button" onClick={verifyPin}>解锁</button>
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>今日全部订单</h2>
            <p className="muted">日期：{today}，共 {orders.length} 条</p>
            <p className="muted">系统按日期显示，00:00 自动切到新一天</p>
          </section>

          <section className="card">
            <h2>Excel 下载</h2>
            <div className="row" style={{ marginTop: 8 }}>
              <input type="date" value={exportDate} onChange={(e) => setExportDate(e.target.value)} style={{ maxWidth: 180 }} />
              <button className="btn" type="button" onClick={downloadByDate}>下载单日</button>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <input type="date" value={exportStart} onChange={(e) => setExportStart(e.target.value)} style={{ maxWidth: 180 }} />
              <input type="date" value={exportEnd} onChange={(e) => setExportEnd(e.target.value)} style={{ maxWidth: 180 }} />
              <button className="btn" type="button" onClick={downloadByRange}>下载日期范围</button>
            </div>
          </section>

          {groups.length === 0 ? (
            <section className="card">
              <p className="muted">今天暂无订单。</p>
            </section>
          ) : (
            <>
              <section className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h3>全部供应商</h3>
                  <div className="row">
                    <button className="btn" onClick={() => copyText(allFormattedText)}>复制全部文本</button>
                    <button className="btn secondary" onClick={() => markSent(groups.map((g) => g.supplier_id))}>全部标记已发送</button>
                  </div>
                </div>
                <p className="muted">
                  {session ? `当前操作人：${session.staff.name}` : "标记「已发送」需员工 PIN 登录（厨师长/店长）。"}
                </p>

                <textarea readOnly value={allFormattedText} />
              </section>

              {groups.map((group) => (
                <section className="card" key={group.supplier_id}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <h3>
                      {group.supplier_name}{" "}
                      {orderStatus[group.supplier_id] && (
                        <span className={`badge ${(STATUS_LABEL[orderStatus[group.supplier_id].status] || { cls: "" }).cls}`}>
                          {(STATUS_LABEL[orderStatus[group.supplier_id].status] || { text: orderStatus[group.supplier_id].status }).text}
                          {orderStatus[group.supplier_id].sent_by ? ` · ${orderStatus[group.supplier_id].sent_by}` : ""}
                        </span>
                      )}
                    </h3>
                    <div className="row">
                      <button className="btn" onClick={() => copyText(group.formatted_text)}>复制文本</button>
                      {(!orderStatus[group.supplier_id] || orderStatus[group.supplier_id].status === "PENDING_SEND") && (
                        <button className="btn secondary" onClick={() => markSent([group.supplier_id])}>已发送</button>
                      )}
                    </div>
                  </div>

                  <textarea readOnly value={group.formatted_text} />

                  <table className="table" style={{ marginTop: 10 }}>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Station</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item) => (
                        <tr key={`${group.supplier_id}-${item.item_name}-${item.unit}`}>
                          <td>{item.item_name}</td>
                          <td>{item.total_quantity}{item.unit}</td>
                          <td>{item.station_names.join("/")}</td>
                          <td>{item.notes.join("; ") || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </>
          )}
        </>
      )}
      <Modal open={loginOpen} onClose={() => setLoginOpen(false)} title="员工登录">
        <StaffLoginPanel onDone={() => setLoginOpen(false)} />
      </Modal>
    </main>
  );
}
