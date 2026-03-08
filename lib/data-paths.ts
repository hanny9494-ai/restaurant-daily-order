import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function resolveBaseDir() {
  const explicit = String(process.env.DATA_DIR || process.env.APP_DATA_DIR || "").trim();
  if (explicit) return explicit;
  if (process.env.VERCEL) return path.join(os.tmpdir(), "data");
  return path.join(process.cwd(), "data");
}

export function ensureDataDir() {
  const dir = resolveBaseDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function resolveDataFile(filename: string) {
  return path.join(ensureDataDir(), filename);
}

