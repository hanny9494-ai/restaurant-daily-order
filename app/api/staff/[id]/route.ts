import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff, staffFromRequest } from "@/lib/ops/auth";

export const dynamic = "force-dynamic";

import { updateStaff } from "@/lib/ops/auth";

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  return handle(async () => {
    const actor = requireStaff(request, "MANAGER");
    const body = await readJson(request);
    return { data: updateStaff(Number(context.params.id), body, actor) };
  });
}
