import { getAccount } from "@/lib/accounts";
import { accountCookieOptions } from "@/lib/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const accountId =
    typeof body.accountId === "string" ? body.accountId.trim() : "";
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  const account = getAccount(accountId);
  if (!account) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }

  const store = await cookies();
  store.set(accountCookieOptions(accountId));

  return NextResponse.json({
    id: account.id,
    username: account.username,
  });
}
