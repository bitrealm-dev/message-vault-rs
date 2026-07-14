import {
  permanentlyDeleteHandle,
  restoreHandle,
  trashHandle,
} from "@/lib/handlesWrite";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { handle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const handle = body.handle?.trim() ?? "";
  if (!handle) {
    return NextResponse.json({ error: "handle required" }, { status: 400 });
  }
  try {
    trashHandle(handle);
    return NextResponse.json({ ok: true, handle });
  } catch (err) {
    const message = err instanceof Error ? err.message : "trash failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  let body: { handle?: string; permanent?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const handle = body.handle?.trim() ?? "";
  if (!handle) {
    return NextResponse.json({ error: "handle required" }, { status: 400 });
  }
  try {
    if (body.permanent) {
      permanentlyDeleteHandle(handle);
      return NextResponse.json({ ok: true, handle, permanent: true });
    }
    restoreHandle(handle);
    return NextResponse.json({ ok: true, handle });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : body.permanent
          ? "delete forever failed"
          : "restore failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
