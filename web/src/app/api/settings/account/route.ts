import { deleteAccount, loadAccount, primaryEmail, saveAccount, type AccountEmail } from "@/lib/accounts";
import {
  unauthorizedResponse,
  withAccountHandler,
} from "@/lib/accountContext";
import { isDemoAccount } from "@/lib/demoAccount";
import { loadVaultOwner } from "@/lib/vaultOwner";
import { clearAccountCookieOptions } from "@/lib/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function accountJson(account: ReturnType<typeof loadAccount>, accountId: string) {
  return {
    id: account.id,
    username: account.username,
    primaryEmail: primaryEmail(account),
    emails: account.emails.map((entry) => ({
      email: entry.email,
      isPrimary: entry.is_primary,
    })),
    readOnly: account.read_only,
    isDemo: isDemoAccount(accountId),
  };
}

function parseEmails(body: Record<string, unknown>): AccountEmail[] | undefined {
  if (!Array.isArray(body.emails)) return undefined;

  const emails: AccountEmail[] = [];
  for (const item of body.emails) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.email !== "string" || !row.email.trim()) continue;
    emails.push({
      email: row.email.trim(),
      is_primary: row.isPrimary === true,
    });
  }
  return emails;
}

function authError(err: unknown): NextResponse | null {
  if (err instanceof Error && err.message === "Not signed in") {
    return unauthorizedResponse();
  }
  return null;
}

export async function GET() {
  try {
    return await withAccountHandler(async (accountId) => {
      const account = loadAccount(accountId);
      const owner = loadVaultOwner(accountId);
      return NextResponse.json({
        ...accountJson(account, accountId),
        vaultOwner: {
          firstName: owner.first_name,
          lastName: owner.last_name,
          displayName: owner.display_name,
          phones: owner.phones,
        },
      });
    });
  } catch (err) {
    const auth = authError(err);
    if (auth) return auth;
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

  try {
    return await withAccountHandler(async (accountId) => {
      const patch: {
        username?: string;
        read_only?: boolean;
        emails?: AccountEmail[];
      } = {};

      if (typeof body.username === "string" && body.username.trim()) {
        patch.username = body.username.trim();
      }
      if (typeof body.readOnly === "boolean") {
        patch.read_only = body.readOnly;
      }

      const emails = parseEmails(body);
      if (emails !== undefined) {
        patch.emails = emails;
      } else if (typeof body.primaryEmail === "string" && body.primaryEmail.trim()) {
        const account = loadAccount(accountId);
        patch.emails = account.emails.map((entry) =>
          entry.is_primary
            ? { email: body.primaryEmail as string, is_primary: true }
            : entry,
        );
      }

      if (
        patch.username === undefined &&
        patch.read_only === undefined &&
        patch.emails === undefined
      ) {
        return NextResponse.json({ error: "no valid fields to update" }, { status: 400 });
      }

      const account = saveAccount(accountId, patch);
      const owner = loadVaultOwner(accountId);
      return NextResponse.json({
        ...accountJson(account, accountId),
        vaultOwner: {
          firstName: owner.first_name,
          lastName: owner.last_name,
          displayName: owner.display_name,
          phones: owner.phones,
        },
      });
    });
  } catch (err) {
    const auth = authError(err);
    if (auth) return auth;
    const message = err instanceof Error ? err.message : "update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    return await withAccountHandler(async (accountId) => {
      deleteAccount(accountId);
      const store = await cookies();
      store.set(clearAccountCookieOptions());
      return NextResponse.json({ ok: true });
    });
  } catch (err) {
    const auth = authError(err);
    if (auth) return auth;
    const message = err instanceof Error ? err.message : "delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
