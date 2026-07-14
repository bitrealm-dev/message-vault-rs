import crypto from "node:crypto";
import fs from "node:fs";

import Database from "better-sqlite3";
import { parse } from "smol-toml";

import { configTomlPath, dbPath } from "./paths";

/** Web account stored in vault.db — `id` is stable when username/email change. */
export type Account = {
  id: string;
  username: string;
  email: string;
  read_only: boolean;
};

type AccountRow = {
  id: string;
  username: string;
  email: string;
  read_only: number;
};

type AccountToml = {
  username?: string;
  login_email?: string;
  read_only?: boolean;
};

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    read_only: row.read_only === 1,
  };
}

function ensureAccountsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      read_only INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function loadAccountSeedFromToml(): Omit<Account, "id"> {
  const text = fs.readFileSync(configTomlPath(), "utf8");
  const cfg = parse(text) as { account?: AccountToml };
  const account = cfg.account;
  if (!account?.username?.trim() || !account.login_email?.trim()) {
    throw new Error("[account] with username and login_email is required in config.toml");
  }
  return {
    username: account.username.trim(),
    email: account.login_email.trim(),
    read_only: account.read_only === true,
  };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function syncAccountToToml(account: Account): void {
  const section = `[account]
username = ${tomlString(account.username)}
login_email = ${tomlString(account.email)}
read_only = ${account.read_only}
`;
  const path = configTomlPath();
  let text = fs.readFileSync(path, "utf8");
  if (/\[account\]/i.test(text)) {
    text = text.replace(/\[account\][\s\S]*?(?=\n\[|\s*$)/, `${section.trim()}\n`);
  } else {
    text = `${text.trim()}\n\n${section}`;
  }
  fs.writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
}

function seedAccountFromToml(db: Database.Database): Account {
  const seed = loadAccountSeedFromToml();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO accounts (id, username, email, read_only)
     VALUES (?, ?, ?, ?)`,
  ).run(id, seed.username, seed.email, seed.read_only ? 1 : 0);
  syncAccountToToml({ id, ...seed });
  return { id, ...seed };
}

export function loadAccount(): Account {
  const db = new Database(dbPath());
  try {
    ensureAccountsTable(db);
    const row = db
      .prepare(`SELECT id, username, email, read_only FROM accounts LIMIT 1`)
      .get() as AccountRow | undefined;
    if (!row) {
      return seedAccountFromToml(db);
    }
    return rowToAccount(row);
  } finally {
    db.close();
  }
}

export function saveAccount(patch: Partial<Pick<Account, "username" | "email" | "read_only">>): Account {
  const db = new Database(dbPath());
  try {
    ensureAccountsTable(db);
    let current = db
      .prepare(`SELECT id, username, email, read_only FROM accounts LIMIT 1`)
      .get() as AccountRow | undefined;
    if (!current) {
      const seeded = seedAccountFromToml(db);
      current = {
        id: seeded.id,
        username: seeded.username,
        email: seeded.email,
        read_only: seeded.read_only ? 1 : 0,
      };
    }

    const next: Account = {
      id: current.id,
      username: patch.username?.trim() || current.username,
      email: patch.email?.trim() || current.email,
      read_only: patch.read_only ?? current.read_only === 1,
    };
    if (!next.username || !next.email) {
      throw new Error("username and email are required");
    }

    db.prepare(
      `UPDATE accounts
       SET username = ?, email = ?, read_only = ?
       WHERE id = ?`,
    ).run(next.username, next.email, next.read_only ? 1 : 0, next.id);

    syncAccountToToml(next);
    return next;
  } finally {
    db.close();
  }
}
