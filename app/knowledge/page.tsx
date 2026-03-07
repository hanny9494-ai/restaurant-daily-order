"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/config";

type L0Row = {
  id: number;
  principle_key: string;
  version: number;
  status: "DRAFT" | "READY" | "PUBLISHED" | "REJECTED";
  claim: string;
  change_reason: string;
  proposer: string;
  reviewer: string | null;
  publisher: string | null;
  citations_count: number;
  created_at: string;
};

type UploadRow = {
  id: number;
  layer: "L1" | "L2" | "L3" | "L4" | "L5";
  payload_json: string;
  uploader: string;
  note: string | null;
  created_at: string;
};

type DraftPayload = {
  principle_key: string;
  claim: string;
  mechanism: string;
  boundary_conditions: Array<unknown>;
  change_reason: string;
  proposer: string;
  citations: Array<{
    source_title: string;
    source_type?: string;
    reliability_tier?: "S" | "A" | "B";
    source_uri?: string;
    locator?: string;
    evidence_snippet: string;
  }>;
  control_variables?: Record<string, unknown>;
  expected_effects?: Array<unknown>;
  counter_examples?: Array<unknown>;
  evidence_level?: "low" | "medium" | "high";
  confidence?: number;
};

export default function KnowledgeAdminPage() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);

  const [l0Rows, setL0Rows] = useState<L0Row[]>([]);
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [draftJson, setDraftJson] = useState(`{
  "principle_key": "collagen_hydrolysis_temp_time",
  "claim": "Collagen hydrolyzes into gelatin under sustained heat and time.",
  "mechanism": "Heat disrupts collagen structure and forms soluble gelatin chains.",
  "boundary_conditions": [{"temperature_c": [75, 95]}, {"time_h": [4, 12]}],
  "change_reason": "Add canonical L0 rule for stock body",
  "proposer": "jeff",
  "citations": [
    {
      "source_title": "On Food and Cooking",
      "source_type": "book",
      "reliability_tier": "S",
      "locator": "chapter: meats and stocks",
      "evidence_snippet": "Long cooking converts collagen to gelatin."
    }
  ]
}`);

  const [batchJson, setBatchJson] = useState(`[
  {
    "principle_key": "emulsion_boil_fat_dispersion",
    "claim": "Vigorous boiling can emulsify fat droplets and create opaque broth.",
    "mechanism": "Mechanical shear + protein fragments stabilize fat dispersion.",
    "boundary_conditions": [{"temperature_c": [100, 105]}, {"agitation": "high"}],
    "change_reason": "Seed second L0 principle",
    "proposer": "jeff",
    "citations": [
      {
        "source_title": "Modernist Cuisine",
        "source_type": "book",
        "reliability_tier": "S",
        "locator": "stocks and sauces",
        "evidence_snippet": "Strong boil and shear can drive stable fat dispersion."
      }
    ]
  }
]`);

  const [reviewer, setReviewer] = useState("reviewer_1");
  const [publisher, setPublisher] = useState("publisher_1");
  const [actionNote, setActionNote] = useState("");

  const [layer, setLayer] = useState<"L1" | "L2" | "L3" | "L4" | "L5">("L1");
  const [uploader, setUploader] = useState("jeff");
  const [uploadNote, setUploadNote] = useState("");
  const [uploadJson, setUploadJson] = useState(`{
  "title": "Chicken stock practice observation",
  "source": "book_chunk_001",
  "goal": "clear broth",
  "parameters": {"temperature_c": 88, "time_h": 6}
}`);

  async function refreshAll() {
    setLoading(true);
    try {
      const [l0Res, uploadRes] = await Promise.all([
        fetch(`${apiBase}/api/l0/changes?limit=100`),
        fetch(`${apiBase}/api/knowledge/uploads?limit=100`)
      ]);
      const l0Json = await l0Res.json();
      const upJson = await uploadRes.json();
      setL0Rows(l0Json.data || []);
      setUploadRows(upJson.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  async function submitDraft() {
    let payload: DraftPayload;
    try {
      payload = JSON.parse(draftJson);
    } catch {
      alert("L0 草稿 JSON 格式错误");
      return;
    }

    const res = await fetch(`${apiBase}/api/l0/changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) {
      alert(`提交失败: ${json.error || "unknown"}`);
      return;
    }
    alert("L0 草稿已提交");
    await refreshAll();
  }

  async function submitBatchDrafts() {
    let payloads: DraftPayload[];
    try {
      payloads = JSON.parse(batchJson);
      if (!Array.isArray(payloads)) throw new Error("NOT_ARRAY");
    } catch {
      alert("批量 JSON 必须是数组");
      return;
    }

    let ok = 0;
    let fail = 0;
    for (const payload of payloads) {
      const res = await fetch(`${apiBase}/api/l0/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) ok += 1;
      else fail += 1;
    }

    alert(`批量提交完成: 成功 ${ok} / 失败 ${fail}`);
    await refreshAll();
  }

  async function reviewChange(id: number, approved: boolean) {
    const res = await fetch(`${apiBase}/api/l0/changes/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewer,
        approved,
        review_note: actionNote || (approved ? "approved in admin UI" : "rejected in admin UI")
      })
    });
    const json = await res.json();
    if (!res.ok) {
      alert(`审核失败: ${json.error || "unknown"}`);
      return;
    }
    alert(approved ? "审核通过" : "已驳回");
    await refreshAll();
  }

  async function publishChange(id: number) {
    const res = await fetch(`${apiBase}/api/l0/changes/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publisher,
        publish_note: actionNote || "published in admin UI"
      })
    });
    const json = await res.json();
    if (!res.ok) {
      alert(`发布失败: ${json.error || "unknown"}`);
      return;
    }
    alert("发布成功");
    await refreshAll();
  }

  async function uploadLayerData() {
    let payload: unknown;
    try {
      payload = JSON.parse(uploadJson);
    } catch {
      alert("L1-L5 上传 JSON 格式错误");
      return;
    }

    const res = await fetch(`${apiBase}/api/knowledge/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layer,
        uploader,
        note: uploadNote,
        payload
      })
    });
    const json = await res.json();
    if (!res.ok) {
      alert(`上传失败: ${json.error || "unknown"}`);
      return;
    }
    alert(`${layer} 上传成功`);
    await refreshAll();
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>知识层后台（L0-L5）</h1>
        <div className="row">
          <Link href="/knowledge/l0/queue" className="btn secondary">L0审阅页</Link>
          <button className="btn secondary" type="button" onClick={refreshAll} disabled={loading}>
            {loading ? "刷新中..." : "刷新"}
          </button>
        </div>
      </div>

      <section className="card">
        <h2>L0 草稿提交（单条）</h2>
        <p className="muted">粘贴 JSON 后直接提交草稿，进入审批队列。</p>
        <textarea value={draftJson} onChange={(e) => setDraftJson(e.target.value)} style={{ minHeight: 260 }} />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" type="button" onClick={submitDraft}>提交草稿</button>
        </div>
      </section>

      <section className="card">
        <h2>L0 批量上载（JSON 数组）</h2>
        <p className="muted">用于一次提交多条 L0 草稿。</p>
        <textarea value={batchJson} onChange={(e) => setBatchJson(e.target.value)} style={{ minHeight: 220 }} />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" type="button" onClick={submitBatchDrafts}>批量提交</button>
        </div>
      </section>

      <section className="card">
        <h2>L0 审批区</h2>
        <div className="grid" style={{ marginBottom: 10 }}>
          <div className="field">
            <label>审核人 reviewer</label>
            <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
          </div>
          <div className="field">
            <label>发布人 publisher</label>
            <input value={publisher} onChange={(e) => setPublisher(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>操作备注（可选）</label>
          <input value={actionNote} onChange={(e) => setActionNote(e.target.value)} />
        </div>

        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>状态</th>
              <th>key@v</th>
              <th>提案人</th>
              <th>引用</th>
              <th>摘要</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {l0Rows.length === 0 ? (
              <tr><td colSpan={7} className="muted">暂无数据</td></tr>
            ) : (
              l0Rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.status}</td>
                  <td>{row.principle_key}@{row.version}</td>
                  <td>{row.proposer}</td>
                  <td>{row.citations_count}</td>
                  <td>{row.claim}</td>
                  <td>
                    <div className="row">
                      <button
                        className="btn secondary"
                        type="button"
                        disabled={row.status !== "DRAFT"}
                        onClick={() => reviewChange(row.id, true)}
                      >
                        审核通过
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        disabled={row.status !== "DRAFT"}
                        onClick={() => reviewChange(row.id, false)}
                      >
                        驳回
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={row.status !== "READY"}
                        onClick={() => publishChange(row.id)}
                      >
                        发布
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>L1-L5 数据上载</h2>
        <p className="muted">先选择层级，再粘贴 JSON 数据上传留档。</p>
        <div className="grid">
          <div className="field">
            <label>层级</label>
            <select value={layer} onChange={(e) => setLayer(e.target.value as any)}>
              <option value="L1">L1</option>
              <option value="L2">L2</option>
              <option value="L3">L3</option>
              <option value="L4">L4</option>
              <option value="L5">L5</option>
            </select>
          </div>
          <div className="field">
            <label>上载人</label>
            <input value={uploader} onChange={(e) => setUploader(e.target.value)} />
          </div>
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>备注（可选）</label>
          <input value={uploadNote} onChange={(e) => setUploadNote(e.target.value)} />
        </div>
        <textarea value={uploadJson} onChange={(e) => setUploadJson(e.target.value)} style={{ minHeight: 220, marginTop: 10 }} />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" type="button" onClick={uploadLayerData}>上传到 {layer}</button>
        </div>
      </section>

      <section className="card">
        <h2>L1-L5 上载记录</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>层级</th>
              <th>上载人</th>
              <th>备注</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {uploadRows.length === 0 ? (
              <tr><td colSpan={5} className="muted">暂无上载记录</td></tr>
            ) : (
              uploadRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.layer}</td>
                  <td>{row.uploader}</td>
                  <td>{row.note || "-"}</td>
                  <td>{row.created_at}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
