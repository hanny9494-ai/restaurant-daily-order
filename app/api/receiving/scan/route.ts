import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createReceivingScanFile, getSuppliers, getUnits, updateReceivingScanFileUrl } from "@/lib/db";
import { callQwenJson, resolveQwenModel } from "@/lib/qwen";
import { receivingScanPrompt } from "@/lib/prompts";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function todayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const image = String(body.image || "").trim();
    if (!image) {
      return NextResponse.json({ success: false, error: { code: "IMAGE_REQUIRED", message: "image is required" } }, { status: 400 });
    }

    const date = String(body.date || todayString()).trim() || todayString();
    const actorEmail = String(body.actor_email || "").trim();
    const guard = await requirePermission("receiving:scan", actorEmail);
    if (!guard.allowed) {
      return NextResponse.json({ success: false, error: { code: guard.error || "FORBIDDEN", message: "无权限执行拍照识别" } }, { status: 403 });
    }
    const filename = String(body.file_name || "receiving-scan.jpg").trim();
    const mimeType = String(body.mime_type || "image/jpeg").trim() || "image/jpeg";

    const bytes = Buffer.from(image, "base64");
    const ext = filename.includes(".")
      ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
      : (mimeType.includes("png") ? ".png" : mimeType.includes("webp") ? ".webp" : ".jpg");
    const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 20);
    const saveDir = path.join(process.cwd(), "data", "uploads", "receiving-scans", date);
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    const safeName = `${Date.now()}-${hash}${ext}`;
    const absolutePath = path.join(saveDir, safeName);
    fs.writeFileSync(absolutePath, bytes);

    const relativePath = path.relative(process.cwd(), absolutePath);
    const scanFileId = createReceivingScanFile({
      service_date: date,
      original_filename: filename,
      mime_type: mimeType,
      file_size_bytes: bytes.length,
      storage_path: absolutePath,
      file_url: "",
      created_by: actorEmail || undefined
    });
    const fileUrl = `/api/receiving/scans/files/${scanFileId}`;
    updateReceivingScanFileUrl(scanFileId, fileUrl);

    const units = getUnits(true);
    const suppliers = getSuppliers(true);
    const aiResult = await callQwenJson({
      model: resolveQwenModel("vision"),
      systemPrompt: receivingScanPrompt,
      imageBase64: image,
      userText: "请识别此来货单。",
      timeoutMs: 45000
    });

    const rawItems = Array.isArray(aiResult?.items) ? aiResult.items : [];
    const mappedItems = rawItems.map((item: any) => {
      const unitRaw = String(item?.unit || "").trim();
      const unitMatched = units.find((u) => normalizeText(u.name) === normalizeText(unitRaw));
      return {
        name: String(item?.name || "").trim(),
        quantity: String(item?.quantity ?? "").trim(),
        unit_raw: unitRaw,
        unit_id: unitMatched?.id ?? null,
        unit_matched: Boolean(unitMatched),
        unit_price: item?.unit_price === null || item?.unit_price === undefined ? null : Number(item.unit_price)
      };
    }).filter((item: { name: string; quantity: string }) => item.name && item.quantity);

    const supplierName = String(aiResult?.supplier_name || "").trim();
    const matchedSupplier = supplierName
      ? suppliers.find((item: { name: string }) => normalizeText(item.name) === normalizeText(supplierName))
      : undefined;
    const unmatchedUnits = (Array.from(
      new Set(
        mappedItems
          .filter((item: { unit_matched: boolean }) => !item.unit_matched)
          .map((item: { unit_raw: string }) => item.unit_raw)
      )
    ) as string[]).filter((item: string) => Boolean(item));
    const total = typeof aiResult?.total === "number"
      ? aiResult.total
      : mappedItems.reduce((sum: number, item: { quantity: string; unit_price: number | null }) => {
          const qty = Number(item.quantity);
          const price = Number(item.unit_price || 0);
          return sum + (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0);
        }, 0);

    return NextResponse.json({
      success: true,
      scan_file_id: scanFileId,
      scan_file_url: fileUrl,
      storage_path: relativePath,
      items: mappedItems,
      supplier_name: supplierName || null,
      supplier_id: matchedSupplier?.id ?? null,
      supplier_matched: Boolean(matchedSupplier),
      unmatched_units: unmatchedUnits,
      total
    });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "AI_TIMEOUT") {
      return NextResponse.json({ success: false, error: { code: "AI_TIMEOUT", message: "识别超时，请重试" } }, { status: 504 });
    }
    if (code === "QWEN_API_KEY_NOT_CONFIGURED") {
      return NextResponse.json({
        success: false,
        error: {
          code: code,
          message: "Qwen API key 未配置，请设置 DASHSCOPE_API_KEY（或 DASHSCOPE_APIKEY / QWEN_API_KEY）"
        }
      }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: { code: "SCAN_FAILED", message: "识别失败，请重试" } }, { status: 500 });
  }
}
