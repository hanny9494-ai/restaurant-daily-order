import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff, staffFromRequest } from "@/lib/ops/auth";

export const dynamic = "force-dynamic";

import { createStaff, listStaff, staffCount } from "@/lib/ops/auth";

// Public: login picker needs names only. ?all=1 (MANAGER+) returns inactive staff too.
export async function GET(request: NextRequest) {
  return handle(() => {
    if (request.nextUrl.searchParams.get("all") === "1") {
      requireStaff(request, "MANAGER");
      return { data: listStaff(true), bootstrap_required: staffCount() === 0 };
    }
    return {
      data: listStaff(false).map((s) => ({ id: s.id, name: s.name, role: s.role })),
      bootstrap_required: staffCount() === 0
    };
  });
}

// First staff (bootstrap) can be created without login and is always ADMIN; afterwards MANAGER+ only.
export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson(request);
    if (staffCount() === 0) {
      const staff = createStaff({ name: body.name, pin: body.pin, role: "ADMIN" }, null);
      return { data: staff, bootstrap: true };
    }
    const actor = requireStaff(request, "MANAGER");
    return { data: createStaff({ name: body.name, pin: body.pin, role: body.role }, actor) };
  });
}
