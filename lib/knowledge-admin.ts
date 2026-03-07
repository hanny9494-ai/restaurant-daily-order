import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

export type KnowledgeLayer = "L1" | "L2" | "L3" | "L4" | "L5";

const runtimeDbBase = process.env.VERCEL ? os.tmpdir() : process.cwd();
const dbDir = path.join(runtimeDbBase, "data");
const dbPath = path.join(dbDir, "l0_engine.db");

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS knowledge_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layer TEXT NOT NULL CHECK (layer IN ('L1','L2','L3','L4','L5')),
  payload_json TEXT NOT NULL,
  uploader TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_uploads_layer ON knowledge_uploads(layer);
`);

export function createKnowledgeUpload(layer: KnowledgeLayer, payload: unknown, uploader: string, note?: string) {
  const cleanUploader = uploader.trim();
  if (!cleanUploader) throw new Error("UPLOADER_REQUIRED");

  const json = JSON.stringify(payload);
  const result = db
    .prepare(`
      INSERT INTO knowledge_uploads (layer, payload_json, uploader, note)
      VALUES (?, ?, ?, ?)
    `)
    .run(layer, json, cleanUploader, note?.trim() || null);

  return db
    .prepare(`
      SELECT id, layer, payload_json, uploader, note, created_at
      FROM knowledge_uploads
      WHERE id = ?
      LIMIT 1
    `)
    .get(Number(result.lastInsertRowid));
}

export function listKnowledgeUploads(layer?: KnowledgeLayer, limit = 50) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  if (layer) {
    return db
      .prepare(`
        SELECT id, layer, payload_json, uploader, note, created_at
        FROM knowledge_uploads
        WHERE layer = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(layer, safeLimit);
  }

  return db
    .prepare(`
      SELECT id, layer, payload_json, uploader, note, created_at
      FROM knowledge_uploads
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(safeLimit);
}
