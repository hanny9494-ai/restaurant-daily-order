// Shared helpers for receiving-loop / stocktake e2e scripts.
// Starts an isolated Next server (own DATA_DIR, fresh SQLite, OCR mock enabled) unless E2E_BASE_URL is given.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

export const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

export async function startServer(name) {
  if (process.env.E2E_BASE_URL) {
    return { baseUrl: process.env.E2E_BASE_URL.replace(/\/+$/, ""), stop: async () => {} };
  }
  const root = process.cwd();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `rdo-${name}-`));
  const port = await freePort();
  const hasBuild = fs.existsSync(path.join(root, ".next", "BUILD_ID"));
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const args = hasBuild ? ["start", "-H", "127.0.0.1", "-p", String(port)] : ["dev", "-H", "127.0.0.1", "-p", String(port)];
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      RECIPES_DB_FILE: "app.db",
      RECEIVING_OCR_MOCK: "1",
      SEED_DEFAULT_SUPPLIERS: "0",
      STAFF_SESSION_SECRET: "e2e-secret",
      STOCKTAKE_TIMING: "END_OF_DAY",
      PRICE_DEVIATION_THRESHOLD: "0.15",
      NODE_ENV: hasBuild ? "production" : "development"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let log = "";
  child.stdout.on("data", (d) => { log += d; });
  child.stderr.on("data", (d) => { log += d; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/staff`);
      if (res.ok) break;
    } catch {}
    if (child.exitCode !== null) throw new Error(`server exited early:\n${log}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`[e2e] server ${hasBuild ? "(next start)" : "(next dev)"} at ${baseUrl}, DATA_DIR=${dataDir}`);
  return {
    baseUrl,
    dataDir,
    log: () => log,
    stop: async () => {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 300));
      if (!process.env.E2E_KEEP_DATA) fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

export function makeClient(baseUrl) {
  let token = "";
  async function call(method, url, body, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    const useToken = opts.token !== undefined ? opts.token : token;
    if (useToken) headers["x-staff-token"] = useToken;
    const res = await fetch(`${baseUrl}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const type = res.headers.get("content-type") || "";
    const data = type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    if (opts.expect !== undefined) {
      if (res.status !== opts.expect) throw new Error(`${method} ${url} expected ${opts.expect} got ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
    } else if (!res.ok) {
      throw new Error(`${method} ${url} -> ${res.status}: ${JSON.stringify(data).slice(0, 600)}`);
    }
    return data;
  }
  return {
    setToken: (t) => { token = t; },
    get: (url, opts) => call("GET", url, undefined, opts),
    post: (url, body, opts) => call("POST", url, body ?? {}, opts),
    patch: (url, body, opts) => call("PATCH", url, body ?? {}, opts),
    del: (url, opts) => call("DELETE", url, undefined, opts),
    async login(staffId, pin) {
      const r = await call("POST", "/api/staff/login", { staff_id: staffId, pin }, { token: "" });
      token = r.token;
      return r.token;
    }
  };
}

let passed = 0;
export function check(cond, message, detail) {
  if (!cond) {
    const err = new Error(`ASSERTION FAILED: ${message}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`);
    throw err;
  }
  passed += 1;
  console.log(`  ok  ${message}`);
}
export function near(a, b, eps = 0.005) {
  return typeof a === "number" && Math.abs(a - b) < eps;
}
export function passedCount() {
  return passed;
}
