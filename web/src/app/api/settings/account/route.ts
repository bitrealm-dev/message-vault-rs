import { loadAccount, saveAccount } from "@/lib/accounts";
import { loadOwner } from "@/lib/config";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const account = loadAccount();
    const owner = loadOwner();
    return NextResponse.json({
      id: account.id,
      username: account.username,
      loginEmail: account.email,
      readOnly: account.read_only,
      vaultOwner: {
        displayName: owner.display_name,
        phones: owner.phones,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to load account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const patch: {
    username?: string;
    email?: string;
    read_only?: boolean;
  } = {};

  if (typeof body.username === "string" && body.username.trim()) {
    patch.username = body.username.trim();
  }
  if (typeof body.loginEmail === "string" && body.loginEmail.trim()) {
    patch.email = body.loginEmail.trim();
  }
  if (typeof body.readOnly === "boolean") {
    patch.read_only = body.readOnly;
  }

  if (
    patch.username === undefined &&
    patch.email === undefined &&
    patch.read_only === undefined
  ) {
    return NextResponse.json({ error: "no valid fields to update" }, { status: 400 });
  }

  try {
    const account = saveAccount(patch);
    const owner = loadOwner();
    return NextResponse.json({
      id: account.id,
      username: account.username,
      loginEmail: account.email,
      readOnly: account.read_only,
      vaultOwner: {
        displayName: owner.display_name,
        phones: owner.phones,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
