"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import { groupOrdersBySupplier } from "@/lib/format";
import type { OrderItem } from "@/lib/types";

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
  const [pinReady, setPinReady] = useState(false);
  const [savedPin, setSavedPin] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [newPin, setNewPin] = useState("");

  async function loadOrders() {
    const res = await fetch(`${apiBase}/api/order?date=${today}`);
    const json = await res.json();
    setOrders(json.data || []);
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
    }
  }, [pinReady, isUnlocked]);

  const groups = useMemo(() => groupOrdersBySupplier(today, orders), [today, orders]);

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

  function savePin() {
    const pin = newPin.trim();
    if (pin.length < 4) {
      alert("PIN 至少 4 位");
      return;
    }
    localStorage.setItem(DASHBOARD_PIN_KEY, pin);
    setSavedPin(pin);
    setNewPin("");
    alert("PIN 已保存");
  }

  function clearPin() {
    localStorage.removeItem(DASHBOARD_PIN_KEY);
    setSavedPin("");
    setIsUnlocked(true);
    setPinInput("");
    alert("PIN 已清除");
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

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1>/dashboard 汇总端</h1>
        <div className="row">
          {isUnlocked && <button className="btn secondary" onClick={loadOrders}>刷新</button>}
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
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>PIN 设置</h2>
              {savedPin && <button className="btn secondary" onClick={() => setIsUnlocked(false)}>上锁</button>}
            </div>
            <p className="muted">当前状态：{savedPin ? "已启用 PIN" : "未设置 PIN"}</p>
            <div className="row" style={{ marginTop: 8 }}>
              <input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder={savedPin ? "输入新 PIN（至少4位）" : "设置 PIN（至少4位）"}
                style={{ maxWidth: 280 }}
              />
              <button className="btn" type="button" onClick={savePin}>{savedPin ? "修改 PIN" : "设置 PIN"}</button>
              {savedPin && <button className="btn danger" type="button" onClick={clearPin}>清除 PIN</button>}
            </div>
          </section>

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
        </>
      )}
    </main>
  );
}
