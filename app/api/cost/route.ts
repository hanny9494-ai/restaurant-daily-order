import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { listCostPeriods } from "@/lib/ops/cost";

export async function GET(request: NextRequest) {
  return handle(() => {
    requireStaff(request, "CHEF");
    return { data: listCostPeriods() };
  });
}
