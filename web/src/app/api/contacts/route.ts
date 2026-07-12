import { createContact, deleteContacts } from "@/lib/contactsWrite";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const firstName =
    body.firstName === null || typeof body.firstName === "string"
      ? body.firstName
      : undefined;
  const lastName =
    body.lastName === null || typeof body.lastName === "string"
      ? body.lastName
      : undefined;
  const phones =
    Array.isArray(body.phones) && body.phones.every((p) => typeof p === "string")
      ? body.phones.map((p) => p.trim()).filter(Boolean)
      : undefined;
  const exclude = typeof body.exclude === "boolean" ? body.exclude : undefined;
  const groups =
    Array.isArray(body.groups) && body.groups.every((t) => typeof t === "string")
      ? body.groups.map((t) => t.trim()).filter(Boolean)
      : undefined;

  try {
    const contact = createContact({ firstName, lastName, phones, exclude, groups });
    return NextResponse.json({ contact });
  } catch (err) {
    const message = err instanceof Error ? err.message : "create failed";
    const status =
      message.includes("required") || message.includes("already belongs")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const ids =
    Array.isArray(body.ids) &&
    body.ids.every((id) => typeof id === "number" && Number.isFinite(id))
      ? (body.ids as number[])
      : null;
  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  try {
    const deleted = deleteContacts(ids);
    return NextResponse.json({ deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "delete failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
