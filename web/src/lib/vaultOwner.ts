import Database from "better-sqlite3";

import { dbPath } from "./paths";
import { ensureVaultSchema } from "./vaultSchema";

export type VaultOwner = {
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
  owner: { display_name: string; phones: string[] },
): void {
  const displayName = owner.display_name.trim() || "Me";
  const phones = owner.phones.map((p) => p.trim()).filter(Boolean);
  if (phones.length === 0) {
    throw new Error("at least one phone is required for importing messages");
  }

  db.prepare(
    `INSERT INTO vault_owners (account_id, display_name)
     VALUES (?, ?)`,
  ).run(accountId, displayName);

  const insertPhone = db.prepare(
    `INSERT INTO vault_owner_phones (account_id, phone) VALUES (?, ?)`,
  );
  for (const phone of phones) {
    insertPhone.run(accountId, phone);
  }
}

/** @deprecated Use createVaultOwner with explicit display name and phone. */
export function createDefaultVaultOwner(
  db: Database.Database,
  accountId: string,
  displayName: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO vault_owners (account_id, display_name)
     VALUES (?, ?)`,
  ).run(accountId, displayName.trim() || "Me");
}

export function loadVaultOwner(accountId: string): VaultOwner {
  const db = openDb();
  try {
    const row = db
      .prepare(`SELECT display_name FROM vault_owners WHERE account_id = ?`)
      .get(accountId) as { display_name: string } | undefined;

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

    return {
      display_name: row?.display_name?.trim() || "Me",
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
      display_name: patch.display_name?.trim() || current.display_name,
      phones:
        patch.phones !== undefined
          ? patch.phones.filter((p) => p.trim() !== "")
          : current.phones,
      emails:
        patch.emails !== undefined
          ? patch.emails.filter((e) => e.trim() !== "")
          : current.emails,
    };

    db.prepare(
      `INSERT INTO vault_owners (account_id, display_name)
       VALUES (?, ?)
       ON CONFLICT(account_id) DO UPDATE SET display_name = excluded.display_name`,
    ).run(accountId, next.display_name);

    db.prepare(`DELETE FROM vault_owner_phones WHERE account_id = ?`).run(accountId);
    const insertPhone = db.prepare(
      `INSERT INTO vault_owner_phones (account_id, phone) VALUES (?, ?)`,
    );
    for (const phone of next.phones) {
      insertPhone.run(accountId, phone.trim());
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
