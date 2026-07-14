import {
  createAccount,
  getAccount,
  listAccounts,
} from "@/lib/accounts";
import {
  accountCookieOptions,
  clearAccountCookieOptions,
} from "@/lib/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ accounts: listAccounts() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to list accounts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const primaryEmail =
    typeof body.primaryEmail === "string" ? body.primaryEmail.trim() : "";
  const firstName =
    typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!username || !primaryEmail || !firstName || !phone) {
    return NextResponse.json(
      { error: "username, primaryEmail, firstName, and phone are required" },
      { status: 400 },
    );
  }

  try {
    const account = createAccount({
      username,
      primaryEmail,
      firstName,
      lastName,
      phone,
    });
    const store = await cookies();
    store.set(accountCookieOptions(account.id));
    return NextResponse.json({
      id: account.id,
      username: account.username,
      primaryEmail: account.emails.find((e) => e.is_primary)?.email ?? "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "create failed";
    const status =
      message.includes("already taken") ||
      message.includes("already used") ||
      message.includes("E.164")
        ? 409
        : message.includes("required") || message.includes("valid phone")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
