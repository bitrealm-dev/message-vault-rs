import {
  messagesForConversationYear,
  messagesForConversations,
} from "@/lib/db";
import {
  unauthorizedResponse,
  withAccountHandler,
} from "@/lib/accountContext";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function authError(err: unknown): NextResponse | null {
  if (err instanceof Error && err.message === "Not signed in") {
    return unauthorizedResponse();
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");
  const year =
    yearParam != null && yearParam !== "" ? Number(yearParam) : null;
  const source = url.searchParams.get("source");
  const rawIds = url.searchParams.get("conversationIds") ?? "";
  const conversationIds = rawIds
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));

  if (!conversationIds.length) {
    return NextResponse.json(
      { error: "conversationIds required" },
      { status: 400 },
    );
  }

  if (year != null) {
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: "invalid year" }, { status: 400 });
    }
    try {
      return await withAccountHandler(async () => {
        const messages = messagesForConversationYear(
          conversationIds,
          year,
          source,
        );
        return NextResponse.json({ messages });
      });
    } catch (err) {
      const auth = authError(err);
      if (auth) return auth;
      const message = err instanceof Error ? err.message : "load failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  try {
    return await withAccountHandler(async () => {
      const messages = messagesForConversations(conversationIds, source);
      return NextResponse.json({ messages });
    });
  } catch (err) {
    const auth = authError(err);
    if (auth) return auth;
    const message = err instanceof Error ? err.message : "load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
