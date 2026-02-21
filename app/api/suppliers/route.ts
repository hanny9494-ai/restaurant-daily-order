import { NextResponse } from "next/server";
import { getSuppliers } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ data: getSuppliers() });
}
