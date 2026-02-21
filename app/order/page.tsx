"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/config";
import type { OrderItem, Station, Supplier } from "@/lib/types";

const units = ["克", "千克", "条", "个", "箱"];

type DraftItem = {
  itemName: string;
  quantity: string;
  unit: string;
  note: string;
};

function createEmptyItem(): DraftItem {
  return {
    itemName: "",
    quantity: "",
    unit: units[0],
    note: ""
  };
}

function todayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function OrderPage() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const today = useMemo(() => todayString(), []);

  const [stations, setStations] = useState<Station[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);

  const [stationId, setStationId] = useState<number | "">("");
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [items, setItems] = useState<DraftItem[]>([createEmptyItem()]);
  const [loading, setLoading] = useState(false);

  async function loadBasics() {
    const [stationsRes, suppliersRes] = await Promise.all([
      fetch(`${apiBase}/api/stations`),
      fetch(`${apiBase}/api/suppliers`)
    ]);

    const stationsJson = await stationsRes.json();
    const suppliersJson = await suppliersRes.json();

    const stationData = stationsJson.data || [];
    setStations(stationData);
    setSuppliers(suppliersJson.data || []);

    if (stationData.length > 0) {
      setStationId(stationData[0].id);
    }
  }

  async function loadTodayOrders() {
    const res = await fetch(`${apiBase}/api/order?date=${today}`);
    const json = await res.json();
    setOrders(json.data || []);
  }

  useEffect(() => {
    loadBasics();
    loadTodayOrders();
  }, []);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItemRow() {
    setItems((prev) => [...prev, createEmptyItem()]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    const finalStationId = stationId || stations[0]?.id;
    if (!finalStationId || !supplierId) {
      alert("请先选择供应商");
      return;
    }

    const payloadItems = items
      .map((it) => ({
        item_name: it.itemName.trim(),
        quantity: it.quantity.trim(),
        unit: it.unit.trim(),
        note: it.note.trim()
      }))
      .filter((it) => it.item_name || it.quantity || it.note);

    if (payloadItems.length === 0) {
      alert("请至少填写一条 item");
      return;
    }

    const invalid = payloadItems.some((it) => !it.item_name || !it.quantity || !it.unit);
    if (invalid) {
      alert("每条 item 需要填写完整：名称、数量、单位");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: payloadItems.map((it) => ({
            date: today,
            station_id: finalStationId,
            supplier_id: supplierId,
            item_name: it.item_name,
            quantity: it.quantity,
            unit: it.unit,
            note: it.note
          }))
        })
      });

      if (!res.ok) {
        alert("提交失败，请重试");
        return;
      }

      setItems([createEmptyItem()]);
      await loadTodayOrders();
      alert(`已提交 ${payloadItems.length} 条 item`);
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: number) {
    const ok = confirm("确认删除这条订单？");
    if (!ok) return;

    const res = await fetch(`${apiBase}/api/order/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("删除失败");
      return;
    }
    await loadTodayOrders();
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1>/order 下单端</h1>
        <Link href="/dashboard" className="btn secondary">去汇总端</Link>
      </div>

      <section className="card">
        <form onSubmit={onSubmit}>
          <div className="grid">
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>供应商</label>
              <select value={supplierId} onChange={(e) => setSupplierId(Number(e.target.value) || "") }>
                <option value="">请选择供应商</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Station</label>
              <select value={stationId} onChange={(e) => setStationId(Number(e.target.value) || "") }>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 8 }}>Item 列表（同一供应商）</h3>
            {items.map((item, idx) => (
              <div key={idx} className="card" style={{ marginBottom: 8, padding: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                  <strong>Item #{idx + 1}</strong>
                  <button className="btn danger" type="button" onClick={() => removeItemRow(idx)}>删除此行</button>
                </div>

                <div className="grid">
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label>ITEM 名称</label>
                    <input
                      value={item.itemName}
                      onChange={(e) => updateItem(idx, { itemName: e.target.value })}
                      placeholder="如 小白菜"
                    />
                  </div>

                  <div className="field">
                    <label>数量</label>
                    <input
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                      placeholder="如 10"
                    />
                  </div>

                  <div className="field">
                    <label>单位</label>
                    <div className="row">
                      {units.map((u) => (
                        <button
                          key={u}
                          type="button"
                          className={`unit-btn ${item.unit === u ? "active" : ""}`}
                          onClick={() => updateItem(idx, { unit: u })}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label>备注（可选）</label>
                    <textarea
                      value={item.note}
                      onChange={(e) => updateItem(idx, { note: e.target.value })}
                      placeholder="可选备注"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button className="btn secondary" type="button" onClick={addItemRow}>+ 新增一条 item</button>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" type="submit" disabled={loading}>{loading ? "提交中..." : "提交订单"}</button>
            <span className="muted">日期：{today}</span>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>今日已提交列表</h2>
        {orders.length === 0 ? (
          <p className="muted">今天还没有订单。</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Station</th>
                <th>Note</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((item) => (
                <tr key={item.id}>
                  <td>{item.supplier_name}</td>
                  <td>{item.item_name}</td>
                  <td>{item.quantity}{item.unit}</td>
                  <td>{item.station_name}</td>
                  <td>{item.note || "-"}</td>
                  <td>
                    <button className="btn danger" type="button" onClick={() => onDelete(item.id)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
