import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { confirmReceiving } from "@/lib/ops/receiving";

// body: { date, supplier_id, lines: ConfirmLine[], invoice_total?, invoice_note?, complete: boolean }
export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = requireStaff(request);
    const body = await readJson(request);
    const date = assertDate(body.date || localToday());
    const supplierId = Number(body.supplier_id);
    if (!supplierId) throw new OpsError("SUPPLIER_REQUIRED", 400);
    return {
      data: confirmReceiving({
        date,
        supplier_id: supplierId,
        lines: Array.isArray(body.lines) ? body.lines : [],
        invoice_total: body.invoice_total ?? null,
        invoice_note: body.invoice_note ?? null,
        complete: body.complete === true
      }, actor)
    };
  });
}
