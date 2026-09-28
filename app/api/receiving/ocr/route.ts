import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { buildComparison, scanInvoice } from "@/lib/ops/receiving";

// Upload one invoice photo for (date, supplier), run OCR (qwen vision) and return the refreshed comparison.
// With RECEIVING_OCR_MOCK=1 the body may carry mock_ocr (used by e2e tests) instead of calling the model.
export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = requireStaff(request);
    const body = await readJson(request);
    const date = assertDate(body.date || localToday());
    const supplierId = Number(body.supplier_id);
    if (!supplierId) throw new OpsError("SUPPLIER_REQUIRED", 400);
    const scan = await scanInvoice({
      date,
      supplier_id: supplierId,
      image_base64: String(body.image || ""),
      file_name: body.file_name,
      mime_type: body.mime_type,
      mock_ocr: body.mock_ocr
    }, actor);
    return { data: { scan, comparison: buildComparison(date, supplierId) } };
  });
}
