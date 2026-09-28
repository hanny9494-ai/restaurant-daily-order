"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DISC_STATUS_LABEL, DISC_TYPE_LABEL, Modal, OpsShell, STATUS_LABEL } from "@/components/ops/StaffGate";
import { api, errorMessage, imageToBase64, localToday, money, qty } from "@/lib/ops/client";
import { convertPrice, unitOptionsFor } from "@/lib/ops/unit-math";
import type { UnitDef } from "@/lib/ops/unit-math";

type OcrLine = { key: string; name: string; quantity: number | null; unit: string; unit_price: number | null; amount: number | null; scan_file_id: number };

type CompareRow = {
  key: string;
  daily_list_item_id: number | null;
  item_id: number | null;
  item_name: string;
  ocr_name?: string;
  unit: string;
  ordered_quantity: number;
  is_extra: boolean;
  ocr_lines: OcrLine[];
  ocr_quantity: number | null;
  ocr_unit_price: number | null;
  reference_unit_price: number | null;
  price_deviation: number | null;
  price_flag: boolean;
  status: string;
  suggested_received_quantity: number;
  suggested_unit_price: number | null;
  suggested_price_unit: string;
  receiving?: {
    receiving_item_id: number;
    received_quantity: number;
    rejected_quantity: number;
    reject_reason: string | null;
    receive_note: string | null;
    problem_photo_file_id: number | null;
    received_by: string | null;
  } | null;
};

type Comparison = {
  date: string;
  supplier_id: number;
  is_locked: boolean;
  order: { status: string; invoice_total: number | null; system_total: number | null; received_by: string | null };
  has_ocr: boolean;
  price_deviation_threshold: number;
  invoice_total_ocr: number | null;
  rows: CompareRow[];
  extras: CompareRow[];
  scans: Array<{ id: number; kind: string; file_url: string; ocr_status: string | null; created_by: string | null; ocr: any }>;
  discrepancies: Array<any>;
};

type Item = UnitDef & { id: number; name: string; aliases: string[] };

type Draft = {
  received: string;
  rejectMode: "OK" | "PARTIAL" | "ALL";
  rejected: string;
  reason: string;
  price: string;
  priceUnit: string;
  note: string;
  photoId: number | null;
  photoUrl: string | null;
  include: boolean;
  assignedTo: string | null;
  ocrFromKey: string | null;
  resolves: string;
};

const REASONS = ["不新鲜", "规格不符", "破损", "过期/临期", "温度不达标", "其他"];

const STATUS_BADGE: Record<string, { text: string; cls: string }> = {
  MATCH: { text: "✅ 相符", cls: "ok" },
  QTY_DIFF: { text: "⚠️ 数量差", cls: "warn" },
  MISSING: { text: "❌ 缺货", cls: "bad" },
  EXTRA: { text: "➕ 多送", cls: "info" },
  UNIT_MISMATCH: { text: "⚠️ 单位不符", cls: "warn" },
  NO_OCR: { text: "手工收货", cls: "" }
};

function initDraft(row: CompareRow, isExtra: boolean): Draft {
  const r = row.receiving;
  const rejected = r?.rejected_quantity || 0;
  const received = r ? r.received_quantity : row.suggested_received_quantity;
  return {
    received: received === null || received === undefined ? "" : String(received),
    rejectMode: rejected > 0 ? (rejected >= received && received > 0 ? "ALL" : "PARTIAL") : "OK",
    rejected: rejected ? String(rejected) : "",
    reason: r?.reject_reason || "",
    price: row.suggested_unit_price === null || row.suggested_unit_price === undefined ? "" : String(row.suggested_unit_price),
    priceUnit: row.suggested_price_unit || row.unit,
    note: r?.receive_note || "",
    photoId: r?.problem_photo_file_id ?? null,
    photoUrl: r?.problem_photo_file_id ? `/api/receiving/scans/files/${r.problem_photo_file_id}` : null,
    include: !isExtra || Boolean(r),
    assignedTo: null,
    ocrFromKey: null,
    resolves: ""
  };
}

function numOrNull(v: string) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function SupplierReceiving() {
  const params = useSearchParams();
  const date = params.get("date") || localToday();
  const supplierId = Number(params.get("supplier_id"));
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [items, setItems] = useState<Map<number, Item>>(new Map());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<CompareRow[]>([]);
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const [openDiscs, setOpenDiscs] = useState<any[]>([]);
  const [scanProgress, setScanProgress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newLine, setNewLine] = useState({ name: "", unit: "", quantity: "", price: "" });
  const [returnFor, setReturnFor] = useState<CompareRow | null>(null);
  const [returnForm, setReturnForm] = useState({ type: "RETURN_LATER", quantity: "", reason: "", effective_date: localToday() });
  const scanInput = useRef<HTMLInputElement>(null);

  function applyComparison(next: Comparison, keepDirty: boolean) {
    setCmp(next);
    setDrafts((prev) => {
      const out: Record<string, Draft> = {};
      for (const row of [...next.rows, ...next.extras]) {
        out[row.key] = keepDirty && dirty.has(row.key) && prev[row.key] ? prev[row.key] : initDraft(row, row.is_extra && !row.daily_list_item_id);
      }
      for (const m of manual) if (prev[m.key]) out[m.key] = prev[m.key];
      return out;
    });
    setInvoiceTotal((prev) => {
      if (keepDirty && prev) return prev;
      const v = next.order?.invoice_total ?? next.invoice_total_ocr;
      return v === null || v === undefined ? prev : String(v);
    });
  }

  async function load(keepDirty = false) {
    setError("");
    try {
      const res = await api<{ data: Comparison }>(`/api/receiving/compare?date=${date}&supplier_id=${supplierId}`);
      applyComparison(res.data, keepDirty);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    if (!supplierId) return;
    load();
    api<{ data: Array<{ id: number; name: string }> }>("/api/suppliers?include_inactive=1")
      .then((r) => setSupplierName(r.data.find((s) => s.id === supplierId)?.name || `#${supplierId}`))
      .catch(() => {});
    api<{ data: Item[] }>("/api/items")
      .then((r) => setItems(new Map(r.data.map((i) => [i.id, i]))))
      .catch(() => {});
    api<{ data: any[] }>(`/api/discrepancies?supplier_id=${supplierId}&status=OPEN`)
      .then((r) => setOpenDiscs(r.data.filter((d) => ["SHORT", "REJECT_ON_SITE", "EXCHANGE"].includes(d.type) && d.date !== date)))
      .catch(() => {});
  }, [date, supplierId]);

  function patch(key: string, p: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...p } }));
    setDirty((prev) => new Set(prev).add(key));
  }

  const locked = Boolean(cmp?.is_locked);
  const allRows = useMemo(() => (cmp ? [...cmp.rows, ...cmp.extras, ...manual] : []), [cmp, manual]);

  function linePrice(row: CompareRow, d: Draft) {
    const p = numOrNull(d.price);
    if (p === null) return null;
    if (d.priceUnit === row.unit) return p;
    const item = row.item_id ? items.get(row.item_id) || null : null;
    return convertPrice(item, p, d.priceUnit, row.unit);
  }

  const totals = useMemo(() => {
    let system = 0;
    let accepted = 0;
    let unconvertible = 0;
    for (const row of allRows) {
      const d = drafts[row.key];
      if (!d || !d.include || d.assignedTo) continue;
      const rec = numOrNull(d.received) || 0;
      const rej = d.rejectMode === "ALL" ? rec : d.rejectMode === "PARTIAL" ? numOrNull(d.rejected) || 0 : 0;
      const p = linePrice(row, d);
      if (numOrNull(d.price) !== null && p === null) unconvertible += 1;
      system += rec * (p || 0);
      accepted += Math.max(0, rec - rej) * (p || 0);
    }
    return { system, accepted, unconvertible };
  }, [allRows, drafts, items]);

  async function onScanFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    const list = Array.from(files);
    for (let i = 0; i < list.length; i += 1) {
      setScanProgress(`识别中 ${i + 1}/${list.length}（最长约 60 秒）...`);
      try {
        const img = await imageToBase64(list[i]);
        const res = await api<{ data: { scan: { ocr_error: string | null }; comparison: Comparison } }>("/api/receiving/ocr", {
          body: { date, supplier_id: supplierId, image: img.base64, file_name: img.name, mime_type: img.mime }
        });
        if (res.data.scan.ocr_error) setError(`第 ${i + 1} 张识别失败（原图已存档），可重拍或直接手工收货：${res.data.scan.ocr_error}`);
        applyComparison(res.data.comparison, true);
      } catch (e) {
        setError(errorMessage(e));
      }
    }
    setScanProgress("");
    if (scanInput.current) scanInput.current.value = "";
  }

  async function ignoreScan(id: number) {
    if (!window.confirm("该单据不参与对单（原图保留）？")) return;
    try {
      await api(`/api/receiving/ocr/${id}`, { method: "DELETE" });
      await load(true);
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function onPhoto(key: string, file: File | undefined) {
    if (!file) return;
    try {
      const img = await imageToBase64(file, 1280);
      const res = await api<{ data: { file_id: number; file_url: string } }>("/api/receiving/photos", {
        body: { date, supplier_id: supplierId, image: img.base64, file_name: img.name, mime_type: img.mime }
      });
      patch(key, { photoId: res.data.file_id, photoUrl: res.data.file_url });
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  function assignExtra(extra: CompareRow, targetKey: string) {
    const target = allRows.find((r) => r.key === targetKey);
    if (!target) return;
    const line = extra.ocr_lines[0];
    patch(targetKey, {
      received: extra.ocr_quantity === null ? "" : String(extra.ocr_quantity),
      price: extra.ocr_unit_price === null ? "" : String(extra.ocr_unit_price),
      priceUnit: line?.unit || target.unit,
      ocrFromKey: extra.key
    });
    patch(extra.key, { assignedTo: targetKey, include: false });
  }

  function unassignExtra(extra: CompareRow) {
    const d = drafts[extra.key];
    if (d?.assignedTo) patch(d.assignedTo, { ocrFromKey: null });
    patch(extra.key, { assignedTo: null });
  }

  function addManualLine() {
    const name = newLine.name.trim();
    const matched = Array.from(items.values()).find((i) => i.name === name || i.aliases.includes(name));
    const unit = newLine.unit.trim() || matched?.base_unit || "";
    if (!name || !unit) {
      alert("请填写品名和单位");
      return;
    }
    const key = `manual:${Date.now()}`;
    const row: CompareRow = {
      key,
      daily_list_item_id: null,
      item_id: matched?.id ?? null,
      item_name: matched?.name || name,
      unit,
      ordered_quantity: 0,
      is_extra: true,
      ocr_lines: [],
      ocr_quantity: null,
      ocr_unit_price: null,
      reference_unit_price: null,
      price_deviation: null,
      price_flag: false,
      status: "EXTRA",
      suggested_received_quantity: Number(newLine.quantity) || 0,
      suggested_unit_price: numOrNull(newLine.price),
      suggested_price_unit: unit
    };
    setManual((prev) => [...prev, row]);
    setDrafts((prev) => ({ ...prev, [key]: { ...initDraft(row, true), include: true } }));
    setDirty((prev) => new Set(prev).add(key));
    setNewLine({ name: "", unit: "", quantity: "", price: "" });
    setAddOpen(false);
  }

  function buildLines() {
    const lines: any[] = [];
    for (const row of allRows) {
      const d = drafts[row.key];
      if (!d || !d.include || d.assignedTo) continue;
      const received = numOrNull(d.received);
      if (received === null || received < 0) throw new Error(`「${row.item_name}」实收数量无效`);
      const rejected = d.rejectMode === "ALL" ? received : d.rejectMode === "PARTIAL" ? numOrNull(d.rejected) || 0 : 0;
      if (rejected > received) throw new Error(`「${row.item_name}」拒收数量大于实收`);
      if (rejected > 0 && !d.reason.trim()) throw new Error(`「${row.item_name}」请选择拒收原因`);
      const ocrSource = d.ocrFromKey ? allRows.find((r) => r.key === d.ocrFromKey) : row;
      const ocrLine = ocrSource?.ocr_lines?.[0];
      lines.push({
        daily_list_item_id: row.daily_list_item_id,
        item_id: row.daily_list_item_id ? undefined : row.item_id,
        item_name: row.daily_list_item_id ? undefined : row.item_name,
        unit: row.daily_list_item_id ? undefined : row.unit,
        received_quantity: received,
        rejected_quantity: rejected,
        reject_reason: rejected > 0 ? d.reason : "",
        input_unit_price: numOrNull(d.price),
        price_unit: d.priceUnit || row.unit,
        receive_note: d.note,
        problem_photo_file_id: d.photoId,
        scan_file_id: ocrLine?.scan_file_id ?? null,
        ocr_name: ocrLine?.name ?? null,
        ocr_quantity: ocrLine?.quantity ?? null,
        ocr_unit: ocrLine?.unit ?? null,
        ocr_unit_price: ocrLine?.unit_price ?? null,
        match_status: cmp?.has_ocr ? (d.ocrFromKey ? "MANUAL_MATCH" : row.status) : "MANUAL",
        resolves_discrepancy_id: d.resolves ? Number(d.resolves) : null
      });
    }
    return lines;
  }

  async function save(complete: boolean) {
    let lines: any[];
    try {
      lines = buildLines();
    } catch (e) {
      alert(errorMessage(e));
      return;
    }
    if (complete) {
      const shortItems = allRows.filter((r) => {
        const d = drafts[r.key];
        return d && d.include && !r.is_extra && (numOrNull(d.received) || 0) < r.ordered_quantity;
      });
      const rejects = allRows.filter((r) => drafts[r.key]?.include && drafts[r.key]?.rejectMode !== "OK");
      const msg = [
        `确认完成 ${supplierName} 收货？`,
        shortItems.length ? `短缺：${shortItems.map((r) => r.item_name).join("、")}` : "",
        rejects.length ? `拒收：${rejects.map((r) => r.item_name).join("、")}` : "",
        "差异会自动生成差异单。"
      ].filter(Boolean).join("\n");
      if (!window.confirm(msg)) return;
    }
    setBusy(true);
    try {
      const res = await api<{ data: { status: string; system_total: number; invoice_diff: number | null } }>("/api/receiving/confirm", {
        body: { date, supplier_id: supplierId, lines, invoice_total: numOrNull(invoiceTotal), complete }
      });
      setManual([]);
      setDirty(new Set());
      await load(false);
      alert(complete
        ? `已完成收货（系统金额 ${money(res.data.system_total)}${res.data.invoice_diff ? `，与单据差 ${money(res.data.invoice_diff)}` : ""}）`
        : "已暂存");
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitReturn() {
    if (!returnFor?.receiving) return;
    try {
      await api("/api/discrepancies", {
        body: {
          type: returnForm.type,
          receiving_item_id: returnFor.receiving.receiving_item_id,
          quantity: Number(returnForm.quantity),
          reason: returnForm.reason,
          effective_date: returnForm.effective_date
        }
      });
      setReturnFor(null);
      await load(true);
      alert("已登记退货（负数红冲）");
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  if (!supplierId) return <p className="error-text">缺少 supplier_id</p>;
  const orderStatus = cmp ? STATUS_LABEL[cmp.order?.status] || { text: cmp.order?.status, cls: "" } : null;
  const invoiceDiff = numOrNull(invoiceTotal) !== null ? (numOrNull(invoiceTotal) as number) - totals.system : null;
  const extrasVisible = cmp?.extras || [];

  function renderLine(row: CompareRow) {
    const d = drafts[row.key];
    if (!d) return null;
    const item = row.item_id ? items.get(row.item_id) || null : null;
    const badge = STATUS_BADGE[row.status] || { text: row.status, cls: "" };
    const received = numOrNull(d.received);
    const liveShort = !row.is_extra && received !== null && received < row.ordered_quantity;
    const priceConv = linePrice(row, d);
    const cls = row.price_flag || liveShort ? "flag" : d.rejectMode !== "OK" ? "bad" : "";
    const isExtraRow = row.is_extra && !row.daily_list_item_id;
    return (
      <div key={row.key} className={`line-card ${cls}`}>
        <div className="line-head">
          <div>
            <div className="line-title">{row.item_name}</div>
            {row.ocr_name && row.ocr_name !== row.item_name && <div className="muted" style={{ fontSize: 13 }}>单据：{row.ocr_name}</div>}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className={`badge ${badge.cls}`}>{badge.text}</span>
            {row.price_flag && <span className="badge warn">💰 价差 {Math.round((row.price_deviation || 0) * 100)}%</span>}
          </div>
        </div>
        <div className="kv">
          <span>订货 <b>{row.is_extra ? "未订" : `${qty(row.ordered_quantity)}${row.unit}`}</b></span>
          {row.ocr_quantity !== null && <span>单据 <b>{qty(row.ocr_quantity)}{row.unit}</b></span>}
          {row.ocr_unit_price !== null && <span>单据价 <b>{money(row.ocr_unit_price)}</b></span>}
          {row.reference_unit_price !== null && <span>上次价 <b>{money(row.reference_unit_price)}</b>/{row.unit}</span>}
          {row.receiving?.received_by && <span>已收：<b>{row.receiving.received_by}</b></span>}
        </div>

        {isExtraRow && !locked && (
          <div className="seg" style={{ marginBottom: 8 }}>
            <button className={d.include ? "active" : ""} onClick={() => patch(row.key, { include: true, assignedTo: null })}>收下（多送）</button>
            <button className={!d.include && !d.assignedTo ? "active bad" : ""} onClick={() => patch(row.key, { include: false })}>不收</button>
            {row.key.startsWith("ocr:") && (
              <select
                value={d.assignedTo || ""}
                onChange={(e) => (e.target.value ? assignExtra(row, e.target.value) : unassignExtra(row))}
                style={{ flex: "1 1 160px" }}
              >
                <option value="">对应到订单品项…</option>
                {cmp?.rows.map((r) => <option key={r.key} value={r.key}>{r.item_name}</option>)}
              </select>
            )}
          </div>
        )}
        {d.assignedTo && <p className="muted">已对应到「{allRows.find((r) => r.key === d.assignedTo)?.item_name}」</p>}

        {d.include && !d.assignedTo && (
          <>
            <div className="grid">
              <div className="field">
                <label>实收数量（{row.unit}）</label>
                <div className="stepper">
                  <button disabled={locked} onClick={() => patch(row.key, { received: String(Math.max(0, (numOrNull(d.received) || 0) - 1)) })}>−</button>
                  <input inputMode="decimal" value={d.received} disabled={locked} onChange={(e) => patch(row.key, { received: e.target.value })} />
                  <button disabled={locked} onClick={() => patch(row.key, { received: String((numOrNull(d.received) || 0) + 1) })}>+</button>
                </div>
                {!row.is_extra && !locked && (
                  <div className="row" style={{ marginTop: 4 }}>
                    <button className="btn secondary" onClick={() => patch(row.key, { received: String(row.ordered_quantity) })}>= 订货量</button>
                    <button className="btn secondary" onClick={() => patch(row.key, { received: "0" })}>没到</button>
                  </div>
                )}
              </div>
              <div className="field">
                <label>单价</label>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input inputMode="decimal" value={d.price} disabled={locked} onChange={(e) => patch(row.key, { price: e.target.value })} placeholder="单价" />
                  <select value={d.priceUnit} disabled={locked} onChange={(e) => patch(row.key, { priceUnit: e.target.value })} style={{ maxWidth: 100 }}>
                    {unitOptionsFor(item, [row.unit, d.priceUnit]).map((u) => <option key={u} value={u}>/{u}</option>)}
                  </select>
                </div>
                {numOrNull(d.price) !== null && priceConv === null && <span className="error-text">无法换算到 {row.unit}</span>}
                {priceConv !== null && d.priceUnit !== row.unit && <span className="muted">= {money(priceConv)}/{row.unit}</span>}
              </div>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>质量</label>
              <div className="seg">
                <button className={d.rejectMode === "OK" ? "active" : ""} disabled={locked} onClick={() => patch(row.key, { rejectMode: "OK", rejected: "" })}>合格</button>
                <button className={d.rejectMode === "PARTIAL" ? "active bad" : ""} disabled={locked} onClick={() => patch(row.key, { rejectMode: "PARTIAL" })}>部分拒收</button>
                <button className={d.rejectMode === "ALL" ? "active bad" : ""} disabled={locked} onClick={() => patch(row.key, { rejectMode: "ALL" })}>全部拒收</button>
              </div>
            </div>
            {d.rejectMode !== "OK" && (
              <div style={{ marginTop: 8 }}>
                {d.rejectMode === "PARTIAL" && (
                  <div className="field">
                    <label>拒收数量（{row.unit}）</label>
                    <input inputMode="decimal" value={d.rejected} disabled={locked} onChange={(e) => patch(row.key, { rejected: e.target.value })} />
                  </div>
                )}
                <div className="seg" style={{ marginTop: 6 }}>
                  {REASONS.map((r) => (
                    <button key={r} className={d.reason === r ? "active" : ""} disabled={locked} onClick={() => patch(row.key, { reason: r })}>{r}</button>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <label className="btn secondary" style={{ cursor: "pointer" }}>
                    📷 问题照片
                    <input type="file" accept="image/*" capture="environment" hidden disabled={locked} onChange={(e) => onPhoto(row.key, e.target.files?.[0])} />
                  </label>
                  {d.photoUrl && <a href={d.photoUrl} target="_blank" rel="noreferrer">查看照片</a>}
                </div>
              </div>
            )}
            <div className="field" style={{ marginTop: 8 }}>
              <input value={d.note} disabled={locked} onChange={(e) => patch(row.key, { note: e.target.value })} placeholder="备注（可选）" />
            </div>
            {isExtraRow && openDiscs.length > 0 && !locked && (
              <div className="field" style={{ marginTop: 8 }}>
                <label>这是补送？关联差异单</label>
                <select value={d.resolves} onChange={(e) => patch(row.key, { resolves: e.target.value })}>
                  <option value="">不是补送</option>
                  {openDiscs.map((x) => (
                    <option key={x.id} value={x.id}>#{x.id} {x.date} {x.item_name} {DISC_TYPE_LABEL[x.type]} {qty(x.quantity)}{x.unit}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
        {row.receiving && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn danger" onClick={() => { setReturnFor(row); setReturnForm({ type: "RETURN_LATER", quantity: "", reason: "", effective_date: localToday() }); }}>
              事后退货 / 换货
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0 }}>{supplierName}</h2>
            <div className="muted">{date}{cmp?.order?.received_by ? ` · 收货 ${cmp.order.received_by}` : ""}</div>
          </div>
          {orderStatus && <span className={`badge ${orderStatus.cls}`}>{orderStatus.text}</span>}
        </div>
        {locked && <p className="error-text">当天已复核锁定，只读。发现问题请用「事后退货 / 换货」。</p>}
        <div className="row" style={{ marginTop: 8 }}>
          <Link href="/receiving" className="btn secondary">← 看板</Link>
          <button className="btn secondary" onClick={() => load(false)}>刷新</button>
        </div>
      </section>

      <section className="card">
        <div className="section-title" style={{ marginTop: 0 }}>
          <h3>来货单拍照对单</h3>
          <span className="muted">{cmp?.scans.filter((s) => s.kind === "INVOICE").length || 0} 张</span>
        </div>
        <label className="big-btn" style={{ display: "block", textAlign: "center", opacity: locked ? 0.45 : 1 }}>
          📷 拍 / 上传来货单（可多张）
          <input ref={scanInput} type="file" accept="image/*" capture="environment" multiple hidden disabled={locked || Boolean(scanProgress)} onChange={(e) => onScanFiles(e.target.files)} />
        </label>
        {scanProgress && <p className="muted" style={{ marginTop: 8 }}>{scanProgress}</p>}
        {!cmp?.has_ocr && !scanProgress && <p className="muted" style={{ marginTop: 8 }}>没有单据或识别失败时，可直接按下方订货清单手工收货。</p>}
        <div className="thumbs" style={{ marginTop: 10 }}>
          {cmp?.scans.filter((s) => s.kind === "INVOICE").map((s) => (
            <div key={s.id} style={{ textAlign: "center" }}>
              <a href={s.file_url} target="_blank" rel="noreferrer"><img src={s.file_url} alt="来货单" /></a>
              <div style={{ fontSize: 11 }}>
                <span className={`badge ${s.ocr_status === "OK" ? "ok" : s.ocr_status === "IGNORED" ? "" : "bad"}`}>{s.ocr_status === "OK" ? "已识别" : s.ocr_status === "IGNORED" ? "已忽略" : "失败"}</span>
              </div>
              {s.ocr_status !== "IGNORED" && !locked && <button className="btn secondary" style={{ padding: "2px 6px", fontSize: 12 }} onClick={() => ignoreScan(s.id)}>忽略</button>}
            </div>
          ))}
        </div>
      </section>

      {error && <p className="error-text">{error}</p>}

      <div className="section-title"><h3>订货清单</h3><span className="muted">{cmp?.rows.length || 0} 项</span></div>
      {cmp?.rows.length === 0 && <p className="muted">该供应商当天无订货（补送/临时来货请用下方「添加多送品项」）。</p>}
      {cmp?.rows.map(renderLine)}

      {(extrasVisible.length > 0 || manual.length > 0) && <div className="section-title"><h3>单据上多出的品项</h3></div>}
      {extrasVisible.map(renderLine)}
      {manual.map(renderLine)}
      {!locked && <button className="big-btn secondary" style={{ width: "100%" }} onClick={() => setAddOpen(true)}>+ 添加多送 / 补送品项</button>}

      <section className="card" style={{ marginTop: 12 }}>
        <h3>金额核对</h3>
        <div className="grid">
          <div className="field">
            <label>单据合计金额</label>
            <input inputMode="decimal" value={invoiceTotal} disabled={locked} onChange={(e) => setInvoiceTotal(e.target.value)} placeholder="来货单合计" />
          </div>
          <div className="stat-grid">
            <div className="stat"><div className="label">系统计算（实收×单价）</div><div className="value">{money(totals.system)}</div></div>
            <div className="stat"><div className="label">合格入账</div><div className="value">{money(totals.accepted)}</div></div>
            <div className="stat"><div className="label">单据 − 系统</div><div className="value" style={{ color: invoiceDiff && Math.abs(invoiceDiff) > 0.01 ? "#b42318" : undefined }}>{invoiceDiff === null ? "-" : money(invoiceDiff)}</div></div>
          </div>
        </div>
        {totals.unconvertible > 0 && <p className="error-text">{totals.unconvertible} 行计价单位无法换算，保存会失败。</p>}
      </section>

      {cmp && cmp.discrepancies.length > 0 && (
        <section className="card">
          <h3>差异单</h3>
          {cmp.discrepancies.map((x) => (
            <div key={x.id} className="row" style={{ justifyContent: "space-between", borderBottom: "1px solid #f0f0f0", padding: "6px 0" }}>
              <span>#{x.id} {x.item_name} · {DISC_TYPE_LABEL[x.type]} {qty(x.quantity)}{x.unit} {x.reason ? `· ${x.reason}` : ""}</span>
              <span className={`badge ${(DISC_STATUS_LABEL[x.status] || { cls: "" }).cls}`}>{(DISC_STATUS_LABEL[x.status] || { text: x.status }).text}</span>
            </div>
          ))}
          <Link href="/discrepancies" className="btn secondary" style={{ marginTop: 8 }}>去处理差异单</Link>
        </section>
      )}

      {!locked && cmp && (
        <div className="sticky-actions">
          <button className="big-btn secondary" disabled={busy} onClick={() => save(false)}>暂存</button>
          <button className="big-btn ok" disabled={busy} onClick={() => save(true)}>完成收货</button>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="添加多送 / 补送品项">
        <div className="field">
          <label>品名</label>
          <input list="ops-item-names" value={newLine.name} onChange={(e) => setNewLine({ ...newLine, name: e.target.value })} />
          <datalist id="ops-item-names">
            {Array.from(items.values()).map((i) => <option key={i.id} value={i.name} />)}
          </datalist>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          <div className="field"><label>单位</label><input value={newLine.unit} onChange={(e) => setNewLine({ ...newLine, unit: e.target.value })} placeholder="默认品项基准单位" /></div>
          <div className="field"><label>数量</label><input inputMode="decimal" value={newLine.quantity} onChange={(e) => setNewLine({ ...newLine, quantity: e.target.value })} /></div>
          <div className="field"><label>单价</label><input inputMode="decimal" value={newLine.price} onChange={(e) => setNewLine({ ...newLine, price: e.target.value })} /></div>
        </div>
        <button className="big-btn" style={{ width: "100%", marginTop: 12 }} onClick={addManualLine}>添加</button>
      </Modal>

      <Modal open={Boolean(returnFor)} onClose={() => setReturnFor(null)} title={`事后退货：${returnFor?.item_name || ""}`}>
        <p className="muted">已收合格 {qty((returnFor?.receiving?.received_quantity || 0) - (returnFor?.receiving?.rejected_quantity || 0))}{returnFor?.unit}，登记后按单价生成负数红冲（锁定后也可登记）。</p>
        <div className="seg">
          <button className={returnForm.type === "RETURN_LATER" ? "active" : ""} onClick={() => setReturnForm({ ...returnForm, type: "RETURN_LATER" })}>退货</button>
          <button className={returnForm.type === "EXCHANGE" ? "active" : ""} onClick={() => setReturnForm({ ...returnForm, type: "EXCHANGE" })}>换货（退+补）</button>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          <div className="field"><label>数量（{returnFor?.unit}）</label><input inputMode="decimal" value={returnForm.quantity} onChange={(e) => setReturnForm({ ...returnForm, quantity: e.target.value })} /></div>
          <div className="field"><label>退货日期</label><input type="date" value={returnForm.effective_date} onChange={(e) => setReturnForm({ ...returnForm, effective_date: e.target.value })} /></div>
        </div>
        <div className="field" style={{ marginTop: 8 }}><label>原因</label><input value={returnForm.reason} onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })} /></div>
        <button className="big-btn danger" style={{ width: "100%", marginTop: 12 }} onClick={submitReturn}>登记退货</button>
      </Modal>
    </>
  );
}

export default function SupplierReceivingPage() {
  return (
    <OpsShell title="按供应商收货">
      {() => (
        <Suspense fallback={<p className="muted">加载中...</p>}>
          <SupplierReceiving />
        </Suspense>
      )}
    </OpsShell>
  );
}
