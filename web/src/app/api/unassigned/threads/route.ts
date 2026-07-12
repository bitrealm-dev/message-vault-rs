import { unassignedThreadsBundle } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const handle = new URL(req.url).searchParams.get("handle")?.trim() ?? "";
  if (!handle) {
    return NextResponse.json({ error: "handle required" }, { status: 400 });
  }
  const source = new URL(req.url).searchParams.get("source");
  const bundle = unassignedThreadsBundle(handle, source);
  if (!bundle) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(bundle);
}
