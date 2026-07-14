import { listGroupMemberContactIds } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Members of a contact group (for undo snapshot / create-group undo guard). */
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const memberContactIds = listGroupMemberContactIds(name);
  return NextResponse.json({ name, memberContactIds });
}
