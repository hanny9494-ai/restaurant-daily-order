import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const envPath = path.join(cwd, ".env.local");
const renderPath = path.join(cwd, "render.yaml");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function valueFor(key, fileEnv) {
  return String(process.env[key] || fileEnv[key] || "").trim();
}

function check(label, ok, detail) {
  const flag = ok ? "OK" : "MISSING";
  console.log(`${flag}  ${label}${detail ? `: ${detail}` : ""}`);
}

const fileEnv = readEnvFile(envPath);

console.log("Deploy readiness check");
console.log(`workspace: ${cwd}`);
console.log("");

check("render.yaml", fs.existsSync(renderPath), renderPath);
check(".env.local", fs.existsSync(envPath), envPath);

const dashscopeKey = valueFor("DASHSCOPE_API_KEY", fileEnv)
  || valueFor("DASHSCOPE_APIKEY", fileEnv)
  || valueFor("QWEN_API_KEY", fileEnv);
check("DashScope API key", Boolean(dashscopeKey), "DASHSCOPE_API_KEY / DASHSCOPE_APIKEY / QWEN_API_KEY");

const dbProvider = valueFor("RECIPES_DB_PROVIDER", fileEnv) || "sqlite";
check("RECIPES_DB_PROVIDER", Boolean(dbProvider), dbProvider);

const postgresUrl = valueFor("POSTGRES_URL", fileEnv) || valueFor("DATABASE_URL", fileEnv);

const dataDir = valueFor("DATA_DIR", fileEnv);
check("DATA_DIR", dbProvider !== "sqlite" || Boolean(dataDir), dataDir || "SQLite 本地可留空，Render 建议 /var/data");

const dbMode = valueFor("RECIPES_DB_MODE", fileEnv);
check("RECIPES_DB_MODE", dbProvider !== "sqlite" || Boolean(dbMode), dbMode || "SQLite 本地可留空，Render 建议 persistent");

check("POSTGRES_URL / DATABASE_URL", dbProvider !== "postgres" || Boolean(postgresUrl), postgresUrl ? "已配置" : "使用 Postgres 时必填");

const webhookUrl = valueFor("BANGWAGONG_WEBHOOK_URL", fileEnv);
check("BANGWAGONG_WEBHOOK_URL", Boolean(webhookUrl), webhookUrl || "可选");

const webhookToken = valueFor("BANGWAGONG_API_TOKEN", fileEnv) || valueFor("BANGWAGONG_WEBHOOK_TOKEN", fileEnv);
check("BANGWAGONG token", Boolean(webhookToken), webhookToken ? "已配置" : "可选");

console.log("");
if (!dashscopeKey) {
  console.log("Result: blocked");
  console.log("Reason: AI 解析相关接口缺少 DashScope API key。");
  process.exitCode = 1;
} else if (dbProvider === "postgres" && !postgresUrl) {
  console.log("Result: blocked");
  console.log("Reason: 当前选择 Postgres，但未配置 POSTGRES_URL 或 DATABASE_URL。");
  process.exitCode = 1;
} else {
  console.log("Result: ready-with-checks");
  console.log("Next:");
  console.log("1. npm run build");
  if (dbProvider === "postgres") {
    console.log("2. npm run postgres:migrate");
    console.log("3. 部署到 Vercel");
    console.log("4. 打开 /api/runtime/status 确认 postgres.configured");
  } else {
    console.log("2. 部署到 Render 或本地启动");
    console.log("3. 打开 /api/runtime/status 确认 recipe_store.mode");
  }
}
