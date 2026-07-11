import { getContact, contactYearlyThreads, contactGroupThreads } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const contact = getContact(id);
  if (!contact) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const source = new URL(req.url).searchParams.get("source");
  return NextResponse.json({
    contact,
    yearly: contactYearlyThreads(id, source),
    groups: contactGroupThreads(id, source),
  });
}
