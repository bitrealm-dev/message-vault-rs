import { messagesForConversationYear } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const conversationId = Number(url.searchParams.get("conversationId"));
  const year = Number(url.searchParams.get("year"));
  if (!Number.isFinite(conversationId) || !Number.isFinite(year)) {
    return NextResponse.json({ error: "conversationId and year required" }, { status: 400 });
  }
  const messages = messagesForConversationYear(conversationId, year);
  return NextResponse.json({ messages });
}
