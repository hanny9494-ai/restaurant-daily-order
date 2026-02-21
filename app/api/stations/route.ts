import { NextResponse } from "next/server";
import { getStations } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ data: getStations() });
}
