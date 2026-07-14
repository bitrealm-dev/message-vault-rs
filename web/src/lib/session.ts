import { cookies } from "next/headers";

export const ACCOUNT_COOKIE = "mv_account_id";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function accountCookieOptions(accountId: string) {
  return {
    name: ACCOUNT_COOKIE,
    value: accountId,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

export function clearAccountCookieOptions() {
  return {
    name: ACCOUNT_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export async function getAccountIdFromCookies(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(ACCOUNT_COOKIE)?.value?.trim();
  return value || null;
}
