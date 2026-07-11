import { messagesForConversationYear } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const source = url.searchParams.get("source");
  const rawIds =
    url.searchParams.get("conversationIds") ??
    url.searchParams.get("conversationId") ??
    "";
  const conversationIds = rawIds
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));

  if (!conversationIds.length || !Number.isFinite(year)) {
    return NextResponse.json(
      { error: "conversationId(s) and year required" },
      { status: 400 },
    );
  }
  const messages = messagesForConversationYear(conversationIds, year, source);
  return NextResponse.json({ messages });
}
