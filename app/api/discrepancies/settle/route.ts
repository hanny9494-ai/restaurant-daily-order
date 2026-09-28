import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { settleDiscrepancies } from "@/lib/ops/discrepancies";

export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = requireStaff(request, "MANAGER");
    const body = await readJson(request);
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n: number) => n > 0) : [];
    if (ids.length === 0) throw new OpsError("IDS_REQUIRED", 400);
    return { data: settleDiscrepancies(ids, actor) };
  });
}
