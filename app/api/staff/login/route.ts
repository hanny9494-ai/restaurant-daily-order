import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff, staffFromRequest } from "@/lib/ops/auth";

export const dynamic = "force-dynamic";

import { login } from "@/lib/ops/auth";

export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson(request);
    return login(Number(body.staff_id), String(body.pin || ""));
  });
}
