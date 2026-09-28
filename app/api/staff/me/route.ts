import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff, staffFromRequest } from "@/lib/ops/auth";

export const dynamic = "force-dynamic";

import { OpsError } from "@/lib/ops/common";

export async function GET(request: NextRequest) {
  return handle(() => {
    const staff = staffFromRequest(request);
    if (!staff) throw new OpsError("STAFF_LOGIN_REQUIRED", 401);
    return { data: staff };
  });
}
