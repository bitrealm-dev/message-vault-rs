import {
  permanentlyDeleteConversation,
  restoreConversation,
  trashConversation,
} from "@/lib/conversationsWrite";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { conversationId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const conversationId = Number(body.conversationId);
  if (!Number.isFinite(conversationId)) {
    return NextResponse.json(
      { error: "conversationId required" },
      { status: 400 },
    );
  }
  try {
    trashConversation(conversationId);
    return NextResponse.json({ ok: true, conversationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "trash failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  let body: { conversationId?: number; permanent?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const conversationId = Number(body.conversationId);
  if (!Number.isFinite(conversationId)) {
    return NextResponse.json(
      { error: "conversationId required" },
      { status: 400 },
    );
  }
  try {
    if (body.permanent) {
      permanentlyDeleteConversation(conversationId);
      return NextResponse.json({
        ok: true,
        conversationId,
        permanent: true,
      });
    }
    restoreConversation(conversationId);
    return NextResponse.json({ ok: true, conversationId });
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
