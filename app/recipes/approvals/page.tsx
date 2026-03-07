"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import type { RecipeUser } from "@/lib/types";

type PendingItem = {
  id: number;
  recipe_id: number;
  code: string;
  name: string;
  recipe_type: "MENU" | "BACKBONE";
  menu_cycle: string | null;
  version_no: number;
  status: string;
  created_by: string;
  change_note: string | null;
  submitted_at: string | null;
  created_at: string;
};

export default function RecipeApprovalsPage() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const [users, setUsers] = useState<RecipeUser[]>([]);
  const [reviewer, setReviewer] = useState("");
  const [publisher, setPublisher] = useState("");
  const [items, setItems] = useState<PendingItem[]>([]);
  const currentReviewer = useMemo(
    () => users.find((user) => user.email === reviewer) || null,
    [users, reviewer]
  );
  const canReview = currentReviewer?.role === "OWNER" || currentReviewer?.role === "REVIEWER";

  async function loadUsers() {
    const res = await fetch(`${apiBase}/api/recipe-users`);
    const json = await res.json();
    const data = (json.data || []) as RecipeUser[];
    setUsers(data);
    const reviewerCandidate = data.find((user) => user.role === "REVIEWER" || user.role === "OWNER");
    if (!reviewer && reviewerCandidate) setReviewer(reviewerCandidate.email);
    const publisherCandidate = data.find((user) => user.role === "OWNER" || user.role === "REVIEWER");
    if (!publisher && publisherCandidate) setPublisher(publisherCandidate.email);
  }

  async function loadPending() {
    const res = await fetch(`${apiBase}/api/recipes/approvals`);
    const json = await res.json();
    setItems(json.data || []);
  }

  useEffect(() => {
    loadUsers();
    loadPending();
  }, []);

  async function review(versionId: number, decision: "approve" | "reject") {
    if (!reviewer) {
      alert("请选择审批人");
      return;
    }
    const reviewNote = prompt(decision === "approve" ? "审批备注（可选）" : "驳回原因（建议填写）") || "";
    const res = await fetch(`${apiBase}/api/recipes/versions/${versionId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewer,
        decision,
        review_note: reviewNote
      })
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(`审批失败: ${json.error || "UNKNOWN_ERROR"}`);
      return;
    }
    await loadPending();
    alert(decision === "approve" ? "已审批通过" : "已驳回");
  }

  async function publish(versionId: number) {
    if (!publisher) {
      alert("请选择发布人");
      return;
    }
    const res = await fetch(`${apiBase}/api/recipes/versions/${versionId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publisher })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(`发布失败: ${json.error || "UNKNOWN_ERROR"}`);
      return;
    }
    const syncMessage = json?.bangwagong?.ok
      ? "已同步 bangwagong"
      : json?.bangwagong?.skipped
        ? "已发布，未配置 bangwagong webhook（跳过同步）"
        : `已发布，bangwagong 同步失败: ${json?.bangwagong?.error || "UNKNOWN_ERROR"}`;
    alert(syncMessage);
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1>食谱审批中心</h1>
        <div className="row">
          <Link href="/recipes" className="btn secondary">返回食谱页面</Link>
          <Link href="/" className="btn secondary">返回首页</Link>
        </div>
      </div>

      <section className="card">
        <h2>审批权限</h2>
        <div className="grid" style={{ marginTop: 8 }}>
          <div className="field">
            <label>审批人（需要 REVIEWER/OWNER）</label>
            <select value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
              {users.map((user) => (
                <option key={`reviewer-${user.id}`} value={user.email}>
                  {user.name} / {user.role} / {user.email}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>发布人（需要 REVIEWER/OWNER）</label>
            <select value={publisher} onChange={(e) => setPublisher(e.target.value)}>
              {users.map((user) => (
                <option key={`publisher-${user.id}`} value={user.email}>
                  {user.name} / {user.role} / {user.email}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!canReview && <p className="muted">当前审批人角色无审批权限。</p>}
      </section>

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <h2>待审批列表</h2>
          <button className="btn secondary" type="button" onClick={loadPending}>刷新</button>
        </div>
        {items.length === 0 ? (
          <p className="muted">当前没有待审批版本。</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>食谱</th>
                <th>类型</th>
                <th>版本</th>
                <th>提交人</th>
                <th>提交时间</th>
                <th>变更说明</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.code} / {item.name}</td>
                  <td>{item.recipe_type}{item.menu_cycle ? ` / ${item.menu_cycle}` : ""}</td>
                  <td>v{item.version_no}</td>
                  <td>{item.created_by}</td>
                  <td>{item.submitted_at || item.created_at}</td>
                  <td>{item.change_note || "-"}</td>
                  <td>
                    <div className="row">
                      <button className="btn secondary" type="button" disabled={!canReview} onClick={() => review(item.id, "approve")}>
                        通过
                      </button>
                      <button className="btn danger" type="button" disabled={!canReview} onClick={() => review(item.id, "reject")}>
                        驳回
                      </button>
                      <button className="btn" type="button" disabled={!canReview} onClick={() => publish(item.id)}>
                        直接发布
                      </button>
                    </div>
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
