import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ensureDataDir } from "@/lib/data-paths";
import { db, OpsError } from "@/lib/ops/common";

const MAX_BYTES = 12 * 1024 * 1024;

/** Store a base64 image under DATA_DIR/uploads/receiving-scans/<date>/ and register it in receiving_scan_files. */
export function saveReceivingUpload(input: {
  date: string;
  supplier_id: number | null;
  image_base64: string;
  file_name?: string;
  mime_type?: string;
  kind: "INVOICE" | "PROBLEM";
  created_by: string;
}) {
  const raw = String(input.image_base64 || "").trim();
  const base64 = raw.includes(",") && raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
  if (!base64) throw new OpsError("IMAGE_REQUIRED", 400);
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) throw new OpsError("IMAGE_REQUIRED", 400);
  if (bytes.length > MAX_BYTES) throw new OpsError("IMAGE_TOO_LARGE", 413);
  const mimeType = String(input.mime_type || "image/jpeg").trim() || "image/jpeg";
  const filename = String(input.file_name || `${input.kind.toLowerCase()}.jpg`).trim();
  const ext = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".")).toLowerCase().replace(/[^.a-z0-9]/g, "")
    : mimeType.includes("png") ? ".png" : mimeType.includes("webp") ? ".webp" : ".jpg";
  const dir = path.join(ensureDataDir(), "uploads", "receiving-scans", input.date);
  fs.mkdirSync(dir, { recursive: true });
  const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 20);
  const absolutePath = path.join(dir, `${Date.now()}-${hash}${ext || ".jpg"}`);
  fs.writeFileSync(absolutePath, bytes);

  const result = db.prepare(`
    INSERT INTO receiving_scan_files(service_date, original_filename, mime_type, file_size_bytes, storage_path, file_url, created_by, supplier_id, kind)
    VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)
  `).run(input.date, filename, mimeType, bytes.length, absolutePath, input.created_by, input.supplier_id, input.kind);
  const id = Number(result.lastInsertRowid);
  const fileUrl = `/api/receiving/scans/files/${id}`;
  db.prepare("UPDATE receiving_scan_files SET file_url = ? WHERE id = ?").run(fileUrl, id);
  return { id, file_url: fileUrl, base64 };
}
