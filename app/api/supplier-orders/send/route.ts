import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { markSent } from "@/lib/ops/receiving";

// Dashboard: after copying the supplier text, mark (date, supplier) as SENT.
export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = requireStaff(request, "CHEF");
    const body = await readJson(request);
    const date = assertDate(body.date || localToday());
    const ids = (Array.isArray(body.supplier_ids) ? body.supplier_ids : [body.supplier_id]).map(Number).filter((n: number) => n > 0);
    if (ids.length === 0) throw new OpsError("SUPPLIER_REQUIRED", 400);
    return { data: markSent(date, ids, actor) };
  });
}
