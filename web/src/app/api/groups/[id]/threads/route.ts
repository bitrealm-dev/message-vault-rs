import { groupYearlyThreads } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  return NextResponse.json({ yearly: groupYearlyThreads(id) });
}
