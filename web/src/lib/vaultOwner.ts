import Database from "better-sqlite3";

import { formatOwnerName, parsePhoneE164 } from "./phoneE164";
import { dbPath } from "./paths";
import { ensureVaultSchema } from "./vaultSchema";

export type VaultOwner = {
  first_name: string;
  last_name: string;
  display_name: string;
  phones: string[];
  emails: string[];
};

function openDb(): Database.Database {
  const db = new Database(dbPath());
  ensureVaultSchema(db);
  return db;
}

export function createVaultOwner(
  db: Database.Database,
  accountId: string,
  owner: { first_name: string; last_name: string; phones: string[] },
): void {
  const firstName = owner.first_name.trim();
  const lastName = owner.last_name.trim();
  if (!firstName) {
    throw new Error("first name is required");
  }

  const phones = owner.phones.map((p) => parsePhoneE164(p));
  if (phones.length === 0) {
    throw new Error("at least one phone is required for importing messages");
  }

  const displayName = formatOwnerName(firstName, lastName) || firstName;

  db.prepare(
    `INSERT INTO vault_owners (account_id, first_name, last_name, display_name)
     VALUES (?, ?, ?, ?)`,
  ).run(accountId, firstName, lastName, displayName);

  const insertPhone = db.prepare(
    `INSERT INTO vault_owner_phones (account_id, phone) VALUES (?, ?)`,
  );
  for (const phone of phones) {
    insertPhone.run(accountId, phone);
  }
}

export function loadVaultOwner(accountId: string): VaultOwner {
  const db = openDb();
  try {
    const row = db
      .prepare(
        `SELECT first_name, last_name, display_name
         FROM vault_owners WHERE account_id = ?`,
      )
      .get(accountId) as
      | { first_name: string; last_name: string; display_name: string }
      | undefined;

    const phones = (
      db
        .prepare(
          `SELECT phone FROM vault_owner_phones WHERE account_id = ? ORDER BY phone`,
        )
        .all(accountId) as Array<{ phone: string }>
    ).map((r) => r.phone);

    const emails = (
      db
        .prepare(
          `SELECT email FROM vault_owner_emails WHERE account_id = ? ORDER BY email`,
        )
        .all(accountId) as Array<{ email: string }>
    ).map((r) => r.email);

    const first_name = row?.first_name?.trim() || "";
    const last_name = row?.last_name?.trim() || "";
    const display_name =
      formatOwnerName(first_name, last_name) ||
      row?.display_name?.trim() ||
      "Me";

    return {
      first_name,
      last_name,
      display_name,
      phones,
      emails,
    };
  } finally {
    db.close();
  }
}

export function saveVaultOwner(
  accountId: string,
  patch: Partial<VaultOwner>,
): VaultOwner {
  const db = openDb();
  try {
    const current = loadVaultOwner(accountId);
    const next: VaultOwner = {
      first_name: patch.first_name?.trim() ?? current.first_name,
      last_name: patch.last_name?.trim() ?? current.last_name,
      display_name:
        formatOwnerName(
          patch.first_name?.trim() ?? current.first_name,
          patch.last_name?.trim() ?? current.last_name,
        ) || current.display_name,
      phones:
        patch.phones !== undefined
          ? patch.phones.map((p) => parsePhoneE164(p))
          : current.phones,
      emails:
        patch.emails !== undefined
          ? patch.emails.filter((e) => e.trim() !== "")
          : current.emails,
    };

    db.prepare(
      `INSERT INTO vault_owners (account_id, first_name, last_name, display_name)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         display_name = excluded.display_name`,
    ).run(accountId, next.first_name, next.last_name, next.display_name);

    db.prepare(`DELETE FROM vault_owner_phones WHERE account_id = ?`).run(accountId);
    const insertPhone = db.prepare(
      `INSERT INTO vault_owner_phones (account_id, phone) VALUES (?, ?)`,
    );
    for (const phone of next.phones) {
      insertPhone.run(accountId, phone);
    }

    db.prepare(`DELETE FROM vault_owner_emails WHERE account_id = ?`).run(accountId);
    const insertEmail = db.prepare(
      `INSERT INTO vault_owner_emails (account_id, email) VALUES (?, ?)`,
    );
    for (const email of next.emails) {
      insertEmail.run(accountId, email.trim());
    }

    return next;
  } finally {
    db.close();
  }
}
