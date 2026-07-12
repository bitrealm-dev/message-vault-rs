import { createGroup, deleteGroup, renameGroup } from "@/lib/contactsWrite";
import { listGroups } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ groups: listGroups() });
}

export async function POST(req: Request) {
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (typeof body.name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  try {
    const name = createGroup(body.name);
    return NextResponse.json({ name, groups: listGroups() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "create failed";
    const status = message.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  let body: { from?: unknown; to?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (typeof body.from !== "string" || typeof body.to !== "string") {
    return NextResponse.json({ error: "from and to required" }, { status: 400 });
  }

  try {
    const name = renameGroup(body.from, body.to);
    return NextResponse.json({ name, groups: listGroups() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "rename failed";
    const status = message.includes("not found")
      ? 404
      : message.includes("already exists")
        ? 409
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (typeof body.name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  try {
    deleteGroup(body.name);
    return NextResponse.json({ ok: true, groups: listGroups() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "delete failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
