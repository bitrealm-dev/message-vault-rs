import { restoreGroup } from "@/lib/contactsWrite";
import { listGroups } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Recreate a deleted group and re-attach member contacts (undo delete group). */
export async function POST(req: Request) {
  let body: { name?: unknown; memberContactIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (typeof body.name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const memberContactIds = Array.isArray(body.memberContactIds)
    ? body.memberContactIds.filter(
        (id): id is number => typeof id === "number" && Number.isFinite(id),
      )
    : [];

  try {
    const name = restoreGroup(body.name, memberContactIds);
    return NextResponse.json({ name, groups: listGroups() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "restore failed";
    const status = message.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
