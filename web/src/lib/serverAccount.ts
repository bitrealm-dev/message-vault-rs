import { requireAccountId } from "./accountContext";
import { runWithAccountAsync } from "./accountScope";

export async function withServerAccount<T>(fn: () => T | Promise<T>): Promise<T> {
  const accountId = await requireAccountId();
  return runWithAccountAsync(accountId, fn);
}
