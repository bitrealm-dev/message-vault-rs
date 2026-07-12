import { addPhoneToContact } from "@/lib/contactsWrite";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!phone) {
    return NextResponse.json({ error: "phone required" }, { status: 400 });
  }

  try {
    const contact = addPhoneToContact(id, phone);
    return NextResponse.json({ contact });
  } catch (err) {
    const message = err instanceof Error ? err.message : "update failed";
    const status = message.includes("not found")
      ? 404
      : message.includes("already belongs")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
