"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import type { RecipeDetail, RecipeUser, RecipeVersionComponent } from "@/lib/types";

type PendingItem = {
  id: number;
  recipe_id: number;
  code: string;
  name: string;
  entity_kind: "COMPOSITE" | "ELEMENT";
  business_type: "MENU" | "BACKBONE";
  technique_family: string | null;
  recipe_type: "MENU" | "BACKBONE";
  menu_cycle: string | null;
  version_no: number;
  status: string;
  created_by: string;
  change_note: string | null;
  submitted_at: string | null;
  approved_at?: string | null;
  created_at: string;
};

type CompositeRecordJson = {
  meta: {
    dish_code: string;
    dish_name: string;
    display_name?: string;
    aliases?: string[];
    entity_kind: "COMPOSITE";
    business_type: "MENU" | "BACKBONE";
    menu_cycle: string | null;
  };
  assembly_components: Array<{
    component_kind: string;
    child_code?: string;
    ref_name: string;
    component_role?: string;
    section?: string;
    sort_order?: number;
    quantity?: string;
    unit?: string;
  }>;
  assembly_steps: Array<{
    step_id?: string;
    step_no: number;
    action: string;
  }>;
};

type RuntimeStatus = {
  mode: "persistent" | "ephemeral";
  provider: string;
  reason: string;
};

function parseCompositeRecord(recipeRecordJson: string | null) {
  if (!recipeRecordJson) return null;
  try {
    const parsed = JSON.parse(recipeRecordJson) as Record<string, any>;
    if (parsed?.meta?.entity_kind === "COMPOSITE" && Array.isArray(parsed?.assembly_components)) {
      return parsed as CompositeRecordJson;
    }
    return null;
  } catch {
    return null;
  }
}

export default function RecipeApprovalsPage() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const [users, setUsers] = useState<RecipeUser[]>([]);
  const [reviewer, setReviewer] = useState("");
  const [publisher, setPublisher] = useState("");
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [approvedItems, setApprovedItems] = useState<PendingItem[]>([]);
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<number, RecipeDetail>>({});
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
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
    setPendingItems(json.data?.pending || []);
    setApprovedItems(json.data?.approved || []);
  }

  useEffect(() => {
    loadUsers();
    loadPending();
    fetch(`${apiBase}/api/runtime/status`)
      .then((res) => res.json())
      .then((json) => setRuntimeStatus(json.data?.recipe_store || null))
      .catch(() => setRuntimeStatus(null));
  }, []);

  const isEphemeralStore = runtimeStatus?.mode === "ephemeral";

  async function loadRecipeDetail(recipeId: number) {
    if (detailCache[recipeId]) return detailCache[recipeId];
    const res = await fetch(`${apiBase}/api/recipes/${recipeId}`);
    const json = await res.json();
    const data = json.data as RecipeDetail;
    setDetailCache((prev) => ({ ...prev, [recipeId]: data }));
    return data;
  }

  async function toggleExpand(item: PendingItem) {
    if (expandedVersionId === item.id) {
      setExpandedVersionId(null);
      return;
    }
    await loadRecipeDetail(item.recipe_id);
    setExpandedVersionId(item.id);
  }

  async function review(versionId: number, decision: "approve" | "reject") {
    if (isEphemeralStore) {
      alert(runtimeStatus?.reason || "当前环境是临时数据库，不能稳定执行审批。");
      return;
    }
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
    if (isEphemeralStore) {
      alert(runtimeStatus?.reason || "当前环境是临时数据库，不能稳定发布版本。");
      return;
    }
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
        {isEphemeralStore && (
          <p className="muted" style={{ marginBottom: 10, color: "#b45309" }}>
            当前环境是临时数据库。审批和发布动作已禁用。{runtimeStatus?.reason || ""}
          </p>
        )}
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
        {pendingItems.length === 0 ? (
          <p className="muted">当前没有待审批版本。</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>食谱</th>
                <th>结构</th>
                <th>类型</th>
                <th>版本</th>
                <th>提交人</th>
                <th>提交时间</th>
                <th>变更说明</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pendingItems.map((item) => (
                <Fragment key={item.id}>
                  <tr key={item.id}>
                    <td>{item.code} / {item.name}</td>
                    <td>{item.entity_kind}</td>
                    <td>{item.recipe_type}{item.menu_cycle ? ` / ${item.menu_cycle}` : ""}</td>
                    <td>v{item.version_no}</td>
                    <td>{item.created_by}</td>
                    <td>{item.submitted_at || item.created_at}</td>
                    <td>{item.change_note || "-"}</td>
                    <td>
                      <div className="row">
                        <button className="btn secondary" type="button" onClick={() => toggleExpand(item)}>
                          {expandedVersionId === item.id ? "收起详情" : "查看详情"}
                        </button>
                        <button className="btn secondary" type="button" disabled={!canReview || isEphemeralStore} onClick={() => review(item.id, "approve")}>
                          通过
                        </button>
                        <button className="btn danger" type="button" disabled={!canReview || isEphemeralStore} onClick={() => review(item.id, "reject")}>
                          驳回
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedVersionId === item.id && (() => {
                    const detail = detailCache[item.recipe_id];
                    const version = detail?.versions.find((v) => v.id === item.id) || null;
                    const composite = parseCompositeRecord(version?.recipe_record_json || null);
                    return (
                      <tr key={`${item.id}-detail`}>
                        <td colSpan={8} style={{ background: "#f8fafc" }}>
                          {!detail || !version ? (
                            <div className="muted">加载详情中...</div>
                          ) : item.entity_kind === "COMPOSITE" && composite ? (
                            <div style={{ display: "grid", gap: 12 }}>
                              <div className="muted">
                                Composite：{composite.meta.display_name || composite.meta.dish_name} / components {composite.assembly_components.length} / steps {composite.assembly_steps.length}
                              </div>
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>类型</th>
                                    <th>名称</th>
                                    <th>角色</th>
                                    <th>阶段</th>
                                    <th>数量</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(version.components || []).map((component: RecipeVersionComponent) => (
                                    <tr key={component.id}>
                                      <td>{component.component_kind}</td>
                                      <td>{component.display_name}</td>
                                      <td>{component.component_role || "-"}</td>
                                      <td>{component.section}</td>
                                      <td>{component.quantity ? `${component.quantity}${component.unit ? ` ${component.unit}` : ""}` : "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>Assembly</th>
                                    <th>动作</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {composite.assembly_steps.map((step, idx) => (
                                    <tr key={step.step_id || `approval-step-${idx}`}>
                                      <td>{step.step_no}</td>
                                      <td>{step.action}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div style={{ display: "grid", gap: 12 }}>
                              <div className="muted">
                                Element：{detail.name} / ingredients {version.ingredients.length}
                              </div>
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>原料</th>
                                    <th>数量</th>
                                    <th>单位</th>
                                    <th>备注</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {version.ingredients.map((ingredient) => (
                                    <tr key={ingredient.id}>
                                      <td>{ingredient.name}</td>
                                      <td>{ingredient.quantity}</td>
                                      <td>{ingredient.unit}</td>
                                      <td>{ingredient.note || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                                {version.instructions || "暂无步骤文本"}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })()}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <h2>待发布列表</h2>
          <button className="btn secondary" type="button" onClick={loadPending}>刷新</button>
        </div>
        {approvedItems.length === 0 ? (
          <p className="muted">当前没有待发布版本。</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>食谱</th>
                <th>结构</th>
                <th>类型</th>
                <th>版本</th>
                <th>提交人</th>
                <th>提交时间</th>
                <th>变更说明</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {approvedItems.map((item) => (
                <Fragment key={item.id}>
                  <tr key={item.id}>
                    <td>{item.code} / {item.name}</td>
                    <td>{item.entity_kind}</td>
                    <td>{item.recipe_type}{item.menu_cycle ? ` / ${item.menu_cycle}` : ""}</td>
                    <td>v{item.version_no}</td>
                    <td>{item.created_by}</td>
                    <td>{item.approved_at || item.created_at}</td>
                    <td>{item.change_note || "-"}</td>
                    <td>
                      <div className="row">
                        <button className="btn secondary" type="button" onClick={() => toggleExpand(item)}>
                          {expandedVersionId === item.id ? "收起详情" : "查看详情"}
                        </button>
                        <button className="btn" type="button" disabled={!canReview || isEphemeralStore} onClick={() => publish(item.id)}>
                          发布
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedVersionId === item.id && (() => {
                    const detail = detailCache[item.recipe_id];
                    const version = detail?.versions.find((v) => v.id === item.id) || null;
                    const composite = parseCompositeRecord(version?.recipe_record_json || null);
                    return (
                      <tr key={`${item.id}-detail`}>
                        <td colSpan={8} style={{ background: "#f8fafc" }}>
                          {!detail || !version ? (
                            <div className="muted">加载详情中...</div>
                          ) : item.entity_kind === "COMPOSITE" && composite ? (
                            <div style={{ display: "grid", gap: 12 }}>
                              <div className="muted">
                                Composite：{composite.meta.display_name || composite.meta.dish_name} / components {composite.assembly_components.length} / steps {composite.assembly_steps.length}
                              </div>
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>类型</th>
                                    <th>名称</th>
                                    <th>角色</th>
                                    <th>阶段</th>
                                    <th>数量</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(version.components || []).map((component: RecipeVersionComponent) => (
                                    <tr key={component.id}>
                                      <td>{component.component_kind}</td>
                                      <td>{component.display_name}</td>
                                      <td>{component.component_role || "-"}</td>
                                      <td>{component.section}</td>
                                      <td>{component.quantity ? `${component.quantity}${component.unit ? ` ${component.unit}` : ""}` : "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>Assembly</th>
                                    <th>动作</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {composite.assembly_steps.map((step, idx) => (
                                    <tr key={step.step_id || `approval-step-${idx}`}>
                                      <td>{step.step_no}</td>
                                      <td>{step.action}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div style={{ display: "grid", gap: 12 }}>
                              <div className="muted">
                                Element：{detail.name} / ingredients {version.ingredients.length}
                              </div>
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>原料</th>
                                    <th>数量</th>
                                    <th>单位</th>
                                    <th>备注</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {version.ingredients.map((ingredient) => (
                                    <tr key={ingredient.id}>
                                      <td>{ingredient.name}</td>
                                      <td>{ingredient.quantity}</td>
                                      <td>{ingredient.unit}</td>
                                      <td>{ingredient.note || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                                {version.instructions || "暂无步骤文本"}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })()}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
