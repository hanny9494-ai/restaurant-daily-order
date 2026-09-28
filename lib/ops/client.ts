// Browser-side helpers for the ops pages (staff session, authed fetch, downloads, image resize).
import { getApiBaseUrl } from "@/lib/config";

export type StaffRole = "RECEIVER" | "CHEF" | "MANAGER" | "ADMIN";
export type StaffSession = { token: string; staff: { id: number; name: string; role: StaffRole }; exp: number };

const SESSION_KEY = "ops_staff_session_v1";
const ROLE_LEVEL: Record<StaffRole, number> = { RECEIVER: 1, CHEF: 2, MANAGER: 3, ADMIN: 4 };
export const ROLE_LABEL: Record<StaffRole, string> = { RECEIVER: "收货员", CHEF: "厨师长", MANAGER: "店长", ADMIN: "管理员" };

export function roleAtLeast(role: StaffRole | undefined | null, min: StaffRole) {
  return Boolean(role) && ROLE_LEVEL[role as StaffRole] >= ROLE_LEVEL[min];
}

export function loadSession(): StaffSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StaffSession;
    if (!s?.token || !s.exp || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: StaffSession | null) {
  try {
    if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage unavailable (private mode): session lives in memory only
  }
  window.dispatchEvent(new CustomEvent("ops-session-change"));
}

export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(code: string, status: number, detail: any) {
    super(code);
    this.status = status;
    this.detail = detail;
  }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const session = loadSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session) headers["x-staff-token"] = session.token;
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: init.method || (init.body !== undefined ? "POST" : "GET"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && session) saveSession(null);
  if (!res.ok) throw new ApiError(String(json?.error || `HTTP_${res.status}`), res.status, json?.detail);
  return json as T;
}

export async function downloadWithAuth(path: string, filename: string) {
  const session = loadSession();
  const res = await fetch(`${getApiBaseUrl()}${path}`, { headers: session ? { "x-staff-token": session.token } : {} });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new ApiError(String(json?.error || `HTTP_${res.status}`), res.status, json?.detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Downscale a phone photo (max side 1600px, JPEG) and return base64 without the data: prefix. */
export async function imageToBase64(file: File, maxSide = 1600): Promise<{ base64: string; mime: string; name: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("NO_CANVAS");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", 0.82);
    return { base64: out.split(",")[1], mime: "image/jpeg", name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
  } catch {
    return { base64: dataUrl.split(",")[1] || "", mime: file.type || "image/jpeg", name: file.name };
  }
}

export function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function money(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return Number(n).toFixed(2);
}

export function qty(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return String(Math.round(Number(n) * 1000) / 1000);
}

export function pct(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return `${(Number(n) * 100).toFixed(2)}%`;
}

const ERROR_TEXT: Record<string, string> = {
  STAFF_LOGIN_REQUIRED: "请先登录",
  PERMISSION_DENIED: "当前角色无权限执行此操作",
  INVALID_CREDENTIALS: "PIN 错误",
  PIN_MUST_BE_4_TO_8_DIGITS: "PIN 需为 4-8 位数字",
  DAILY_LIST_LOCKED: "当天已复核锁定，不能修改",
  NOT_ALL_SUPPLIERS_RECEIVED: "还有供应商未完成收货",
  UNLOCK_REASON_REQUIRED: "请填写解锁原因",
  INVALID_PRICE_UNIT_CONVERSION: "计价单位无法换算到下单单位，请在品项主档设置换算",
  INVALID_REJECTED_QUANTITY: "拒收数量不能大于实收数量",
  RETURN_EXCEEDS_ACCEPTED: "退货数量超过已收合格数量",
  UNCOUNTED_ITEMS: "还有未盘品项",
  ITEM_NAME_OR_ALIAS_CONFLICT: "品名/别名与已有品项冲突",
  STOCKTAKE_ALREADY_OPEN_FOR_DATE: "该日期已有进行中的盘点",
  REVENUE_PERIOD_OVERLAP: "营业额日期与已有记录重叠",
  UNIT_NOT_CONVERTIBLE: "该单位无法换算到基准单位",
  IMAGE_TOO_LARGE: "图片太大",
  REASON_REQUIRED: "请填写原因"
};

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const base = ERROR_TEXT[error.message] || error.message;
    if (error.message === "NOT_ALL_SUPPLIERS_RECEIVED" && error.detail?.pending) {
      return `${base}：${error.detail.pending.map((p: any) => p.supplier_name).join("、")}`;
    }
    if (error.message === "ITEM_NAME_OR_ALIAS_CONFLICT" && error.detail?.conflict_item_name) {
      return `${base}（${error.detail.name} 已属于 ${error.detail.conflict_item_name}）`;
    }
    return base;
  }
  return String((error as any)?.message || error);
}
