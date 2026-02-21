"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import { groupOrdersBySupplier } from "@/lib/format";
import type { OrderItem } from "@/lib/types";

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
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const today = useMemo(() => todayString(), []);
  const [orders, setOrders] = useState<OrderItem[]>([]);

  async function loadOrders() {
    const res = await fetch(`${apiBase}/api/order?date=${today}`);
    const json = await res.json();
    setOrders(json.data || []);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const groups = useMemo(() => groupOrdersBySupplier(today, orders), [today, orders]);

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

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1>/dashboard 汇总端</h1>
        <div className="row">
          <button className="btn secondary" onClick={loadOrders}>刷新</button>
          <Link href="/order" className="btn secondary">去下单端</Link>
        </div>
      </div>

      <section className="card">
        <h2>今日全部订单</h2>
        <p className="muted">日期：{today}，共 {orders.length} 条</p>
      </section>

      {groups.length === 0 ? (
        <section className="card">
          <p className="muted">今天暂无订单。</p>
        </section>
      ) : (
        groups.map((group) => (
          <section className="card" key={group.supplier_id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3>{group.supplier_name}</h3>
              <button className="btn" onClick={() => copyText(group.formatted_text)}>复制文本</button>
            </div>

            <textarea readOnly value={group.formatted_text} />

            <table className="table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Station</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.station_name}</td>
                    <td>{item.item_name}</td>
                    <td>{item.quantity}{item.unit}</td>
                    <td>{item.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </main>
  );
}
