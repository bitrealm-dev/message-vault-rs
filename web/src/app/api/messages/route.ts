import {
  messagesForConversationYear,
  messagesForConversations,
} from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");
  const year =
    yearParam != null && yearParam !== "" ? Number(yearParam) : null;
  const source = url.searchParams.get("source");
  const rawIds =
    url.searchParams.get("conversationIds") ??
    url.searchParams.get("conversationId") ??
    "";
  const conversationIds = rawIds
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));

  if (!conversationIds.length) {
    return NextResponse.json(
      { error: "conversationId(s) required" },
      { status: 400 },
    );
  }

  if (year != null) {
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: "invalid year" }, { status: 400 });
    }
    const messages = messagesForConversationYear(
      conversationIds,
      year,
      source,
    );
    return NextResponse.json({ messages });
  }

  const messages = messagesForConversations(conversationIds, source);
  return NextResponse.json({ messages });
}
