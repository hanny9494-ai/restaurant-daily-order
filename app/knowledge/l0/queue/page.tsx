"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/config";

type L0ListRow = {
  id: number;
  principle_key: string;
  version: number;
  status: "DRAFT" | "READY" | "PUBLISHED" | "REJECTED" | "NEED_EVIDENCE";
  claim: string;
  proposer: string;
  citations_count: number;
  created_at: string;
};

type L0DetailRow = L0ListRow & {
  mechanism: string;
  change_reason: string;
  confidence: number;
  boundary_conditions: string;
  review_note: string | null;
  citations: Array<{
    id: number;
    source_title: string;
    source_type: string;
    locator: string | null;
    evidence_snippet: string;
  }>;
};

export default function L0QueuePage() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const [rows, setRows] = useState<L0ListRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<L0DetailRow | null>(null);
  const [reviewer, setReviewer] = useState("reviewer_1");
  const [publisher, setPublisher] = useState("publisher_1");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadQueue() {
    const res = await fetch(`${apiBase}/api/l0/changes?limit=200`);
    const json = await res.json();
    const data = (json.data || []) as L0ListRow[];
    setRows(data);
    if (!selectedId && data.length > 0) {
      setSelectedId(data[0].id);
    }
  }

  async function loadDetail(id: number) {
    const res = await fetch(`${apiBase}/api/l0/changes?id=${id}`);
    const json = await res.json();
    if (res.ok) {
      setDetail(json.data || null);
    } else {
      setDetail(null);
    }
  }

  async function refreshAll() {
    setLoading(true);
    try {
      await loadQueue();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    }
  }, [selectedId]);

  async function review(id: number, decision: "approve" | "reject" | "need_evidence") {
    const res = await fetch(`${apiBase}/api/l0/changes/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewer,
        decision,
        review_note: note || `decision=${decision} via queue`
      })
    });
    const json = await res.json();
    if (!res.ok) {
      alert(`审核失败: ${json.error || "unknown"}`);
      return;
    }
    await refreshAll();
    await loadDetail(id);
  }

  async function publish(id: number) {
    const res = await fetch(`${apiBase}/api/l0/changes/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publisher,
        publish_note: note || "published via queue"
      })
    });
    const json = await res.json();
    if (!res.ok) {
      alert(`发布失败: ${json.error || "unknown"}`);
      return;
    }
    await refreshAll();
    await loadDetail(id);
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <h1>L0 审阅队列</h1>
        <div className="row">
          <Link href="/knowledge" className="btn secondary">返回后台</Link>
          <button className="btn secondary" onClick={refreshAll} disabled={loading}>
            {loading ? "刷新中..." : "刷新"}
          </button>
        </div>
      </div>

      <div className="grid" style={{ alignItems: "start" }}>
        <section className="card">
          <h2>候选列表</h2>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>状态</th>
                <th>key@v</th>
                <th>证据</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="muted">暂无候选</td></tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    style={{ background: selectedId === row.id ? "#f2f7ff" : "transparent", cursor: "pointer" }}
                  >
                    <td>{row.id}</td>
                    <td>{row.status}</td>
                    <td>{row.principle_key}@{row.version}</td>
                    <td>{row.citations_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>审阅详情</h2>
          {!detail ? (
            <p className="muted">请选择左侧候选</p>
          ) : (
            <>
              <p><strong>{detail.principle_key}@{detail.version}</strong> · {detail.status}</p>
              <p className="muted">提案人: {detail.proposer} · 置信度: {detail.confidence}</p>
              <p><strong>Claim:</strong> {detail.claim}</p>
              <p><strong>Mechanism:</strong> {detail.mechanism}</p>
              <p><strong>Boundary:</strong> {detail.boundary_conditions}</p>
              <p><strong>Reason:</strong> {detail.change_reason}</p>
              <div>
                <strong>Evidence:</strong>
                {detail.citations.length === 0 ? (
                  <p className="muted">无证据</p>
                ) : (
                  <ul>
                    {detail.citations.map((c) => (
                      <li key={c.id}>
                        {c.source_title} {c.locator ? `(${c.locator})` : ""} - {c.evidence_snippet}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid" style={{ marginTop: 10 }}>
                <div className="field">
                  <label>审核人</label>
                  <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
                </div>
                <div className="field">
                  <label>发布人</label>
                  <input value={publisher} onChange={(e) => setPublisher(e.target.value)} />
                </div>
              </div>

              <div className="field" style={{ marginTop: 8 }}>
                <label>备注</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="btn secondary"
                  onClick={() => review(detail.id, "approve")}
                  disabled={detail.status !== "DRAFT"}
                >
                  审核通过
                </button>
                <button
                  className="btn danger"
                  onClick={() => review(detail.id, "reject")}
                  disabled={detail.status !== "DRAFT"}
                >
                  驳回
                </button>
                <button
                  className="btn secondary"
                  onClick={() => review(detail.id, "need_evidence")}
                  disabled={detail.status !== "DRAFT"}
                >
                  需补证据
                </button>
                <button
                  className="btn"
                  onClick={() => publish(detail.id)}
                  disabled={detail.status !== "READY"}
                >
                  发布
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
