import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { createRevenue, listRevenue } from "@/lib/ops/cost";

export async function GET(request: NextRequest) {
  return handle(() => {
    requireStaff(request, "CHEF");
    const sp = request.nextUrl.searchParams;
    return { data: listRevenue(sp.get("start") || undefined, sp.get("end") || undefined) };
  });
}

// body: { start_date, end_date (optional, = start for daily), amount, note }
export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = requireStaff(request, "CHEF");
    return { data: createRevenue(await readJson(request), actor) };
  });
}
