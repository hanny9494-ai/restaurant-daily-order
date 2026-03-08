"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/config";
import type { DailyListItem, DailyListMeta, RecipeUser, Supplier, UnitOption } from "@/lib/types";
import { convertUnitPrice, getPriceUnitOptions, normalizeUnitAlias } from "@/lib/unit-convert";

function todayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type ScanItem = {
  name: string;
  quantity: string;
  unit_raw: string;
  unit_id: number | null;
  unit_matched: boolean;
  unit_price: number | null;
  price_unit?: string;
  quality_ok?: number;
};

type ScanResponse = {
  success: boolean;
  scan_file_id?: number;
  scan_file_url?: string;
  storage_path?: string;
  items: ScanItem[];
  supplier_name: string | null;
  supplier_id: number | null;
  supplier_matched: boolean;
  unmatched_units: string[];
  total: number;
};

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ReceivingPage() {
  const router = useRouter();
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const [date, setDate] = useState(todayString());
  const [items, setItems] = useState<DailyListItem[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [users, setUsers] = useState<RecipeUser[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [meta, setMeta] = useState<DailyListMeta | null>(null);
  const [loading, setLoading] = useState(false);

  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [scanSupplierId, setScanSupplierId] = useState<number | null>(null);

  async function loadUsers() {
    const res = await fetch(`${apiBase}/api/recipe-users`);
    const json = await res.json();
    const data = (json.data || []) as RecipeUser[];
    setUsers(data);
    if (!selectedUser && data.length > 0) {
      const preferred = data.find((u) => u.role === "RECEIVER") || data.find((u) => u.role === "EDITOR") || data[0];
      setSelectedUser(preferred.email);
    }
  }

  async function loadUnitOptions() {
    const res = await fetch(`${apiBase}/api/units`);
    const json = await res.json();
    setUnitOptions(json.data || []);
  }

  async function loadSuppliers() {
    const res = await fetch(`${apiBase}/api/suppliers`);
    const json = await res.json();
    setSuppliers(json.data || []);
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
    loadUsers();
    loadUnitOptions();
    loadSuppliers();
  }, []);

  useEffect(() => {
    loadData();
    setScanResult(null);
    setScanError("");
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

  function patchScanItem(index: number, patch: Partial<ScanItem>) {
    setScanResult((prev) => {
      if (!prev) return prev;
      const arr = [...prev.items];
      arr[index] = { ...arr[index], ...patch };
      return { ...prev, items: arr };
    });
  }

  async function addMissingUnit(name: string) {
    const unitName = name.trim();
    if (!unitName) return;
    const res = await fetch(`${apiBase}/api/units`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: unitName })
    });
    if (!res.ok) {
      alert("新增单位失败");
      return;
    }
    const json = await res.json();
    const createdId = Number(json?.data?.id || 0);
    await loadUnitOptions();
    if (createdId > 0) {
      setScanResult((prev) => {
        if (!prev) return prev;
        const updated = prev.items.map((it) => it.unit_raw === unitName ? { ...it, unit_id: createdId, unit_matched: true } : it);
        return {
          ...prev,
          items: updated,
          unmatched_units: prev.unmatched_units.filter((unit) => unit !== unitName)
        };
      });
    }
  }

  async function handleScanFile(file: File) {
    setScanLoading(true);
    setScanError("");
    setScanResult(null);
    try {
      const base64 = await toBase64(file);
      const res = await fetch(`${apiBase}/api/receiving/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64,
          date,
          actor_email: selectedUser,
          file_name: file.name,
          mime_type: file.type || "image/jpeg"
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        setScanError(json?.error?.message || json?.error || "识别失败，请重试");
        return;
      }
      const data = json as ScanResponse;
      const nextItems = (data.items || []).map((it) => ({
        ...it,
        quality_ok: it.quality_ok === 0 ? 0 : 1,
        price_unit: it.price_unit ? it.unit_raw : normalizeUnitAlias(it.unit_raw)
      }));
      setScanResult({ ...data, items: nextItems });
      setScanSupplierId(data.supplier_id || null);
    } finally {
      setScanLoading(false);
    }
  }

  async function confirmScan() {
    if (!scanResult) return;
    if (!scanSupplierId) {
      alert("请先选择供应商");
      return;
    }
    const hasNoUnit = scanResult.items.some((it) => !it.unit_id);
    if (hasNoUnit) {
      alert("存在未匹配单位，请先选择或新增单位");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/receiving/scan/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          supplier_id: scanSupplierId,
          actor_email: selectedUser,
          scan_file_id: scanResult.scan_file_id ?? null,
          items: scanResult.items.map((it) => ({
            name: it.name,
            quantity: it.quantity,
            unit_id: it.unit_id,
            unit_price: it.unit_price,
            price_unit: it.price_unit || it.unit_raw,
            quality_ok: it.quality_ok === 0 ? 0 : 1
          }))
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`扫描入库失败: ${json.error || "UNKNOWN_ERROR"}`);
        return;
      }
      alert("扫描收货已保存（未锁单）");
      setScanResult(null);
      setScanError("");
      await loadData();
    } finally {
      setLoading(false);
    }
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
      alert("收货记录已保存并锁定");
      await loadData();
    } finally {
      setLoading(false);
    }
  }

  async function lockByApi() {
    if (!selectedUser) {
      alert("请先选择操作人");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/receiving/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, actor_email: selectedUser })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`锁单失败: ${json.error || "UNKNOWN_ERROR"}`);
        return;
      }
      alert("已手动锁单");
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
        <div className="grid">
          <div className="field">
            <label>日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>操作人</label>
            <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
              {users.map((user) => (
                <option key={user.id} value={user.email}>{user.name} / {user.role}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn secondary" type="button" onClick={loadData}>刷新</button>
          <button className="btn secondary" type="button" onClick={lockByApi} disabled={loading || Boolean(meta?.is_locked)}>
            手动锁单
          </button>
          {meta?.is_locked && (
            <button className="btn danger" type="button" onClick={unlockReceiving} disabled={loading}>
              解锁修改
            </button>
          )}
          <button className="btn" type="button" onClick={saveReceiving} disabled={loading || Boolean(meta?.is_locked)}>
            手动录入保存并锁定
          </button>
        </div>
      </section>

      <section className="card">
        <h2>拍照识别收货</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleScanFile(file);
            }}
          />
          {scanLoading && <span className="muted">识别中（最长45秒）...</span>}
        </div>
        {scanError && <p className="muted" style={{ color: "#b42318" }}>{scanError}</p>}

        {scanResult && (
          <>
            <div className="grid" style={{ marginBottom: 8 }}>
              <div className="field">
                <label>供应商</label>
                  <select value={scanSupplierId ?? ""} onChange={(e) => setScanSupplierId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">请选择供应商</option>
                  {suppliers.map((it) => (
                    <option key={it.id} value={it.id}>{it.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>识别总额</label>
                <input value={String(scanResult.total || 0)} readOnly />
              </div>
            </div>
            {scanResult.scan_file_url && (
              <p className="muted" style={{ marginBottom: 8 }}>
                原图已保存：<a href={scanResult.scan_file_url} target="_blank">查看原文件</a>
              </p>
            )}

            {scanResult.unmatched_units.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <p className="muted" style={{ color: "#b42318" }}>存在未匹配单位：{scanResult.unmatched_units.join("、")}</p>
                <div className="row">
                  {scanResult.unmatched_units.map((u) => (
                    <button key={u} className="btn secondary" type="button" onClick={() => addMissingUnit(u)}>新增单位：{u}</button>
                  ))}
                </div>
              </div>
            )}

            <table className="table">
              <thead>
                <tr>
                  <th>品名</th>
                  <th>数量</th>
                  <th>单位</th>
                  <th>质量</th>
                  <th>单价</th>
                </tr>
              </thead>
              <tbody>
                {scanResult.items.map((item, idx) => (
                  <tr key={`scan-${idx}`}>
                    <td>
                      <input value={item.name} onChange={(e) => patchScanItem(idx, { name: e.target.value })} />
                    </td>
                    <td>
                      <input value={item.quantity} onChange={(e) => patchScanItem(idx, { quantity: e.target.value })} />
                    </td>
                    <td>
                      <select value={item.unit_id ?? ""} onChange={(e) => patchScanItem(idx, { unit_id: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">未匹配（{item.unit_raw}）</option>
                        {unitOptions.map((u) => (
                          <option key={`${idx}-${u.id}`} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="row">
                        <button className={`unit-btn ${item.quality_ok !== 0 ? "active" : ""}`} type="button" onClick={() => patchScanItem(idx, { quality_ok: 1 })}>Good</button>
                        <button className={`unit-btn ${item.quality_ok === 0 ? "active" : ""}`} type="button" onClick={() => patchScanItem(idx, { quality_ok: 0 })}>No</button>
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unit_price ?? ""}
                        onChange={(e) => patchScanItem(idx, { unit_price: e.target.value === "" ? null : Number(e.target.value) })}
                        disabled={item.quality_ok === 0}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn secondary" type="button" onClick={() => setScanResult(null)}>清空结果</button>
              <button className="btn" type="button" onClick={confirmScan} disabled={loading}>确认扫描入库（不锁单）</button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>当日收货总金额（仅合格）: {totalAmount.toFixed(2)}</h2>
        {meta?.is_locked && (
          <p className="muted" style={{ marginTop: 8, color: "#b42318" }}>
            当前日期已锁定（{meta.receiving_locked_at || "已完成"}），清单只读。
          </p>
        )}
      </section>

      <section className="card">
        {items.length === 0 ? (
          <p className="muted">当日无快照数据，请先刷新生成快照。</p>
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
