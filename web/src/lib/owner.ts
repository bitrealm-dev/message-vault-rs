import { loadAccount } from "./accounts";
import { loadOwner } from "./config";
import { isEmailHandle } from "./handleKind";

/** Strip non-digits; drop leading US country code 1 when 11 digits. */
export function phoneDigits(handle: string): string {
  let digits = handle.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits;
}

export function isVaultReadOnly(): boolean {
  return loadAccount().read_only;
}

export function assertVaultWritable(): void {
  if (isVaultReadOnly()) {
    throw new Error("Vault is in read-only mode");
  }
}

/** True when handle belongs to the vault owner or web account login email. */
export function isOwnerHandle(handle: string): boolean {
  const trimmed = handle.trim();
  if (!trimmed) return false;

  const account = loadAccount();
  if (isEmailHandle(trimmed)) {
    return trimmed.toLowerCase() === account.email.toLowerCase();
  }

  const digits = phoneDigits(trimmed);
  if (!digits) return false;
  const owner = loadOwner();
  return owner.phones.some((p) => phoneDigits(p) === digits);
}

export function assertNotOwnerHandle(handle: string): void {
  if (isOwnerHandle(handle)) {
    throw new Error(
      "This number or email belongs to the vault owner or web account and cannot be assigned to a contact",
    );
  }
}
