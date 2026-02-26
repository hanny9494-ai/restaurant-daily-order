"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/config";
import type { DailyListItem, DailyListMeta, UnitOption } from "@/lib/types";
import { convertUnitPrice, getPriceUnitOptions, normalizeUnitAlias } from "@/lib/unit-convert";

function todayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ReceivingPage() {
  const router = useRouter();
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const [date, setDate] = useState(todayString());
  const [items, setItems] = useState<DailyListItem[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [meta, setMeta] = useState<DailyListMeta | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadUnitOptions() {
    const res = await fetch(`${apiBase}/api/units`);
    const json = await res.json();
    setUnitOptions(json.data || []);
  }

  async function loadData() {
    const res = await fetch(`${apiBase}/api/daily-list?date=${date}`);
    const json = await res.json();
    setItems(
      (json.data || []).map((it: DailyListItem) => ({
        ...it,
        price_unit: it.price_unit || normalizeUnitAlias(it.unit)
      }))
    );
    setMeta(json.meta || null);
  }

  useEffect(() => {
    loadUnitOptions();
  }, []);

  useEffect(() => {
    loadData();
  }, [date]);

  function normalizePriceRow(row: DailyListItem): DailyListItem {
    const defaultPriceUnit = normalizeUnitAlias(row.price_unit || row.unit);
    if (row.quality_ok !== 1) {
      return { ...row, unit_price: null, input_unit_price: null, price_unit: defaultPriceUnit };
    }

    if (row.input_unit_price === null || row.input_unit_price === undefined) {
      return { ...row, unit_price: null, price_unit: defaultPriceUnit };
    }

    const input = Number(row.input_unit_price);
    if (!Number.isFinite(input)) {
      return { ...row, unit_price: null, price_unit: defaultPriceUnit };
    }

    const converted = convertUnitPrice(input, defaultPriceUnit, row.unit);
    return {
      ...row,
      price_unit: defaultPriceUnit,
      unit_price: converted === null ? null : converted
    };
  }

  function patchItem(id: number, patch: Partial<DailyListItem>) {
    if (meta?.is_locked) return;
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      return normalizePriceRow({ ...it, ...patch });
    }));
  }

  async function saveReceiving() {
    if (meta?.is_locked) {
      alert("该日期收货已锁定，不能再修改。");
      return;
    }
    setLoading(true);
    try {
      const payload = items.map((it) => ({
        daily_list_item_id: it.id,
        quality_ok: it.quality_ok === 1 ? 1 : 0,
        input_unit_price: it.input_unit_price,
        price_unit: it.price_unit || it.unit,
        receive_note: it.receive_note || ""
      }));

      const invalidConvert = items.some((it) => (
        it.quality_ok === 1 &&
        it.input_unit_price !== null &&
        it.input_unit_price !== undefined &&
        it.unit_price === null
      ));
      if (invalidConvert) {
        alert("存在无法换算的计价单位，请调整后再保存。");
        return;
      }

      const res = await fetch(`${apiBase}/api/receiving`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, items: payload })
      });

      if (!res.ok) {
        if (res.status === 409) {
          alert("该日期收货已锁定，不能再修改。");
          await loadData();
          return;
        }
        alert("保存失败");
        return;
      }

      const json = await res.json();
      setMeta(json.meta || null);
      alert("收货记录已保存");
      await loadData();
    } finally {
      setLoading(false);
    }
  }

  async function unlockReceiving() {
    const ok = window.confirm("确认解锁当天清单？解锁后可继续修改收货数据。");
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/receiving/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date })
      });

      if (!res.ok) {
        alert("解锁失败");
        return;
      }

      alert("已解锁，可继续修改。");
      await loadData();
    } finally {
      setLoading(false);
    }
  }

  const totalAmount = items.reduce((sum, it) => {
    if (it.quality_ok !== 1) return sum;
    const qty = Number(it.total_quantity);
    const price = Number(it.unit_price ?? 0);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return sum;
    return sum + qty * price;
  }, 0);
  const priceUnitNames = unitOptions.map((u) => u.name);

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1>/receiving 收货端</h1>
        <div className="row">
          <button className="btn secondary" type="button" onClick={() => router.push("/dashboard")}>返回汇总端</button>
        </div>
      </div>

      <section className="card">
        <div className="row">
          <label>日期</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 180 }} />
          <button className="btn secondary" type="button" onClick={loadData}>刷新</button>
          {meta?.is_locked && (
            <button className="btn danger" type="button" onClick={unlockReceiving} disabled={loading}>
              {loading ? "处理中..." : "发现质量问题，解锁修改"}
            </button>
          )}
          <button className="btn" type="button" onClick={saveReceiving} disabled={loading || Boolean(meta?.is_locked)}>
            {loading ? "保存中..." : meta?.is_locked ? "已锁定" : "保存收货并锁定"}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          可按计价单位录入单价（支持克/千克/斤自动换算到下单单位）。质量不合格（NO）的条目不会计入总金额。保存后即锁定，当日清单不可再编辑。
        </p>
        {meta?.is_locked && (
          <p className="muted" style={{ marginTop: 8, color: "#b42318" }}>
            当前日期已锁定（{meta.receiving_locked_at || "已完成"}），清单只读。
          </p>
        )}
      </section>

      <section className="card">
        <h2>当日收货总金额（仅合格）: {totalAmount.toFixed(2)}</h2>
      </section>

      <section className="card">
        {items.length === 0 ? (
          <p className="muted">当日无快照数据，请先在收货端刷新（会自动生成当日快照）。</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>供应商</th>
                <th>品名</th>
                <th>数量</th>
                <th>质量</th>
                <th>单价</th>
                <th>计价单位</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.supplier_name}</td>
                  <td>{it.item_name}</td>
                  <td>{it.total_quantity}{it.unit}</td>
                  <td>
                    <div className="row">
                      <button
                        type="button"
                        className={`unit-btn ${it.quality_ok === 1 ? "active" : ""}`}
                        disabled={Boolean(meta?.is_locked)}
                        onClick={() => patchItem(it.id, { quality_ok: 1 })}
                      >
                        Good
                      </button>
                      <button
                        type="button"
                        className={`unit-btn ${it.quality_ok === 0 ? "active" : ""}`}
                        disabled={Boolean(meta?.is_locked)}
                        onClick={() => patchItem(it.id, { quality_ok: 0, input_unit_price: null, unit_price: null })}
                      >
                        No
                      </button>
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={it.input_unit_price ?? ""}
                      disabled={it.quality_ok !== 1 || Boolean(meta?.is_locked)}
                      onChange={(e) => patchItem(it.id, { input_unit_price: e.target.value === "" ? null : Number(e.target.value) })}
                      style={{ maxWidth: 120 }}
                    />
                  </td>
                  <td>
                    <select
                      value={it.price_unit || normalizeUnitAlias(it.unit)}
                      disabled={it.quality_ok !== 1 || Boolean(meta?.is_locked)}
                      onChange={(e) => patchItem(it.id, { price_unit: e.target.value })}
                    >
                      {getPriceUnitOptions(it.unit, priceUnitNames).map((u) => (
                        <option key={`${it.id}-${u}`} value={u}>{u}</option>
                      ))}
                    </select>
                    {it.quality_ok === 1 && it.input_unit_price !== null && it.unit_price === null && (
                      <p className="muted" style={{ marginTop: 4, color: "#b42318" }}>该单位无法换算到下单单位 {it.unit}</p>
                    )}
                  </td>
                  <td>
                    <input
                      value={it.receive_note || ""}
                      disabled={Boolean(meta?.is_locked)}
                      onChange={(e) => patchItem(it.id, { receive_note: e.target.value })}
                      placeholder="可选"
                    />
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
