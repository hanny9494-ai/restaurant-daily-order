"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/config";
import type { Supplier } from "@/lib/types";

const DASHBOARD_PIN_KEY = "dashboard_pin";

export default function DashboardManagePage() {
  const router = useRouter();
  const apiBase = useMemo(() => getApiBaseUrl(), []);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [savedPin, setSavedPin] = useState("");
  const [newPin, setNewPin] = useState("");

  async function loadSuppliers() {
    const res = await fetch(`${apiBase}/api/suppliers?include_inactive=1`);
    const json = await res.json();
    setSuppliers(json.data || []);
  }

  useEffect(() => {
    setSavedPin(localStorage.getItem(DASHBOARD_PIN_KEY) || "");
    loadSuppliers();
  }, []);

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
    alert("PIN 已清除");
  }

  async function createSupplier() {
    const name = newSupplierName.trim();
    if (!name) {
      alert("请输入供应商名称");
      return;
    }

    const res = await fetch(`${apiBase}/api/suppliers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    if (!res.ok) {
      alert("新增供应商失败");
      return;
    }

    setNewSupplierName("");
    await loadSuppliers();
    alert("供应商已新增");
  }

  async function toggleSupplierStatus(id: number, nextActive: boolean) {
    const res = await fetch(`${apiBase}/api/suppliers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: nextActive ? 1 : 0 })
    });

    if (!res.ok) {
      alert("操作失败");
      return;
    }

    await loadSuppliers();
    alert(nextActive ? "已启用供应商" : "已停用供应商");
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1>/dashboard/manage 管理设置</h1>
        <button className="btn secondary" type="button" onClick={() => router.push("/dashboard")}>返回汇总端</button>
      </div>

      <section className="card">
        <h2>PIN 设置</h2>
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
        <h2>供应商管理</h2>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            value={newSupplierName}
            onChange={(e) => setNewSupplierName(e.target.value)}
            placeholder="输入新供应商名称"
            style={{ maxWidth: 280 }}
          />
          <button className="btn" type="button" onClick={createSupplier}>新建供应商</button>
        </div>
        <table className="table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>供应商</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td>{supplier.name}</td>
                <td>{supplier.is_active ? "启用中" : "已停用"}</td>
                <td>
                  {supplier.is_active ? (
                    <button
                      className="btn danger"
                      type="button"
                      onClick={() => toggleSupplierStatus(supplier.id, false)}
                    >
                      停用
                    </button>
                  ) : (
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => toggleSupplierStatus(supplier.id, true)}
                    >
                      启用
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
