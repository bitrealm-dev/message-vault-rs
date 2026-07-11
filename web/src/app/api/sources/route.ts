import { loadSources } from "@/lib/paths";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const sources = loadSources().map((s) => ({ id: s.id }));
  return NextResponse.json({ sources });
}
