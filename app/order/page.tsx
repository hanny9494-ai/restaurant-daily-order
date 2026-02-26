"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/config";
import type { OrderItem, Station, Supplier, UnitOption } from "@/lib/types";

const ORDER_DRAFT_KEY = "ensue_order_draft_v2";
const ORDER_STAGED_KEY = "ensue_order_staged_v1";

type DraftItem = {
  itemName: string;
  quantity: string;
  unit: string;
  note: string;
};

type StagedLine = {
  temp_id: string;
  date: string;
  station_id: number;
  station_name: string;
  supplier_id: number;
  supplier_name: string;
  item_name: string;
  quantity: string;
  unit: string;
  note: string;
};

function createEmptyItem(): DraftItem {
  return {
    itemName: "",
    quantity: "",
    unit: "",
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
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);

  const [stationId, setStationId] = useState<number | "">("");
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [items, setItems] = useState<DraftItem[]>([createEmptyItem()]);
  const [stagedLines, setStagedLines] = useState<StagedLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);

  async function loadBasics() {
    const [stationsRes, suppliersRes, unitsRes] = await Promise.all([
      fetch(`${apiBase}/api/stations`),
      fetch(`${apiBase}/api/suppliers`),
      fetch(`${apiBase}/api/units`)
    ]);

    const stationsJson = await stationsRes.json();
    const suppliersJson = await suppliersRes.json();
    const unitsJson = await unitsRes.json();

    const stationData = stationsJson.data || [];
    const unitData = unitsJson.data || [];
    setStations(stationData);
    setSuppliers(suppliersJson.data || []);
    setUnits(unitData);

    if (stationData.length > 0) {
      setStationId(stationData[0].id);
    }

    if (unitData.length > 0) {
      setItems((prev) =>
        prev.map((row) => ({
          ...row,
          unit: row.unit || unitData[0].name
        }))
      );
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawDraft = localStorage.getItem(ORDER_DRAFT_KEY);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft) as {
          date: string;
          stationId: number | "";
          supplierId: number | "";
          items: DraftItem[];
        };

        if (parsed && parsed.date === today) {
          setStationId(parsed.stationId || "");
          setSupplierId(parsed.supplierId || "");
          if (Array.isArray(parsed.items) && parsed.items.length > 0) {
            setItems(parsed.items);
          }
        }
      }

      const rawStaged = localStorage.getItem(ORDER_STAGED_KEY);
      if (rawStaged) {
        const parsed = JSON.parse(rawStaged) as { date: string; lines: StagedLine[] };
        if (parsed && parsed.date === today && Array.isArray(parsed.lines)) {
          setStagedLines(parsed.lines);
        }
      }
    } catch {
      // ignore malformed local data
    } finally {
      setDraftLoaded(true);
    }
  }, [today]);

  useEffect(() => {
    if (!draftLoaded || typeof window === "undefined") return;
    localStorage.setItem(
      ORDER_DRAFT_KEY,
      JSON.stringify({
        date: today,
        stationId,
        supplierId,
        items
      })
    );
  }, [draftLoaded, today, stationId, supplierId, items]);

  useEffect(() => {
    if (!draftLoaded || typeof window === "undefined") return;
    localStorage.setItem(
      ORDER_STAGED_KEY,
      JSON.stringify({
        date: today,
        lines: stagedLines
      })
    );
  }, [draftLoaded, today, stagedLines]);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeItemRow(index: number) {
    setItems((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function collectDraftItems() {
    const finalStationId = stationId || stations[0]?.id;
    const finalSupplierId = supplierId;

    if (!finalStationId || !finalSupplierId) {
      alert("请先选择供应商和类别");
      return null;
    }

    const station = stations.find((s) => s.id === finalStationId);
    const supplier = suppliers.find((s) => s.id === finalSupplierId);
    if (!station || !supplier) {
      alert("供应商或类别无效");
      return null;
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
      return null;
    }

    const invalid = payloadItems.some((it) => !it.item_name || !it.quantity || !it.unit);
    if (invalid) {
      alert("每条 item 需要填写完整：名称、数量、单位");
      return null;
    }

    return { finalStationId, finalSupplierId, stationName: station.name, supplierName: supplier.name, payloadItems };
  }

  function onStageOrder(e: FormEvent) {
    e.preventDefault();

    const payload = collectDraftItems();
    if (!payload) return;

    const lines: StagedLine[] = payload.payloadItems.map((it, idx) => ({
      temp_id: `${Date.now()}_${idx}_${Math.random().toString(16).slice(2)}`,
      date: today,
      station_id: payload.finalStationId,
      station_name: payload.stationName,
      supplier_id: payload.finalSupplierId,
      supplier_name: payload.supplierName,
      item_name: it.item_name,
      quantity: it.quantity,
      unit: it.unit,
      note: it.note
    }));

    setStagedLines((prev) => [...prev, ...lines]);
    setItems([{ ...createEmptyItem(), unit: units[0]?.name || "" }]);
    alert(`已暂存 ${lines.length} 条，检查无误后再点“提交订单”`);
  }

  function removeStagedLine(tempId: string) {
    setStagedLines((prev) => prev.filter((l) => l.temp_id !== tempId));
  }

  function clearStagedLines() {
    const ok = confirm("确认清空待提交订单？");
    if (!ok) return;
    setStagedLines([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(ORDER_STAGED_KEY);
    }
  }

  async function submitStagedOrders() {
    if (stagedLines.length === 0) {
      alert("当前没有待提交订单");
      return;
    }

    const ok = confirm("确定单已下齐了吗叼毛？");
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: stagedLines.map((it) => ({
            date: it.date,
            station_id: it.station_id,
            supplier_id: it.supplier_id,
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

      setStagedLines([]);
      if (typeof window !== "undefined") {
        localStorage.removeItem(ORDER_STAGED_KEY);
      }
      await loadTodayOrders();
      alert(`提交成功，共 ${stagedLines.length} 条`);
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

  const stagedGroups = useMemo(() => {
    const map = new Map<string, { title: string; lines: StagedLine[] }>();
    for (const line of stagedLines) {
      const key = `${line.supplier_id}::${line.station_id}`;
      const title = `${line.supplier_name} / ${line.station_name}`;
      const existing = map.get(key);
      if (existing) {
        existing.lines.push(line);
      } else {
        map.set(key, { title, lines: [line] });
      }
    }
    return Array.from(map.values());
  }, [stagedLines]);

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1>/order 下单端</h1>
        <Link href="/dashboard" className="btn secondary">去汇总端</Link>
      </div>

      <section className="card">
        <form onSubmit={onStageOrder}>
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
              <label>类别（Station）</label>
              <select value={stationId} onChange={(e) => setStationId(Number(e.target.value) || "") }>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 8 }}>填写条目（先暂存）</h3>
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
                          key={u.id}
                          type="button"
                          className={`unit-btn ${item.unit === u.name ? "active" : ""}`}
                          onClick={() => updateItem(idx, { unit: u.name })}
                        >
                          {u.name}
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

            <button className="btn secondary" type="button" onClick={() => {
              setItems((prev) => [...prev, { ...createEmptyItem(), unit: units[0]?.name || "" }]);
            }}>+ 新增一条 item</button>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" type="submit" disabled={loading}>{loading ? "处理中..." : "先下单（暂存）"}</button>
            <span className="muted">日期：{today}</span>
            <span className="muted">系统按日期显示，00:00 自动切到新一天</span>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>待提交订单（本机暂存）</h2>
          <div className="row">
            <button className="btn danger" type="button" onClick={clearStagedLines}>清空暂存</button>
            <button className="btn danger-solid" type="button" onClick={submitStagedOrders} disabled={loading || stagedLines.length === 0}>
              {loading ? "提交中..." : "提交订单"}
            </button>
          </div>
        </div>
        <p className="muted">退出后再次进入，今日暂存内容会保留在本设备。</p>
        {stagedGroups.length === 0 ? (
          <p className="muted">当前没有暂存订单。</p>
        ) : (
          stagedGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="card" style={{ padding: 12 }}>
              <h3>{group.title}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Note</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {group.lines.map((line) => (
                    <tr key={line.temp_id}>
                      <td>{line.item_name}</td>
                      <td>{line.quantity}{line.unit}</td>
                      <td>{line.note || "-"}</td>
                      <td>
                        <button className="btn danger" type="button" onClick={() => removeStagedLine(line.temp_id)}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
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
