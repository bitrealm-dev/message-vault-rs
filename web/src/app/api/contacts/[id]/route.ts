import { getContact } from "@/lib/db";
import { patchContact } from "@/lib/contactsWrite";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const contact = getContact(id);
  if (!contact) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ contact });
}

export async function PATCH(req: Request, { params }: Params) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: { display?: unknown; status?: unknown; tags?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const patch: {
    display?: boolean;
    status?: "current" | "historical";
    tags?: string[];
  } = {};
  if (typeof body.display === "boolean") {
    patch.display = body.display;
  }
  if (body.status === "current" || body.status === "historical") {
    patch.status = body.status;
  }
  if (Array.isArray(body.tags) && body.tags.every((t) => typeof t === "string")) {
    patch.tags = body.tags.map((t) => t.trim()).filter(Boolean);
  }
  if (
    patch.display === undefined &&
    patch.status === undefined &&
    patch.tags === undefined
  ) {
    return NextResponse.json(
      { error: "display, status, and/or tags required" },
      { status: 400 },
    );
  }

  try {
    const contact = patchContact(id, patch);
    return NextResponse.json({ contact });
  } catch (err) {
    const message = err instanceof Error ? err.message : "update failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
