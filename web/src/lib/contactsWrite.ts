import Database from "better-sqlite3";
import { dbPath } from "./paths";
import { getContact, resetDb } from "./db";
import {
  appendContactsCsv,
  removeContactsCsv,
  rewriteCsvTags,
  updateContactsCsv,
} from "./contactsCsv";
import { clearTrashedHandles } from "./handlesWrite";
import type { ContactDetail } from "./types";
import {
  isReservedGroupName,
  RESERVED_GROUP_NAMES,
  reservedGroupError,
} from "./reservedGroups";

export type ContactPatch = {
  exclude?: boolean;
  groups?: string[];
  firstName?: string | null;
  lastName?: string | null;
  phones?: string[];
};

function assertAllowedGroupName(name: string): void {
  if (isReservedGroupName(name)) {
    throw new Error(reservedGroupError(name));
  }
}

export type ContactCreate = {
  firstName?: string | null;
  lastName?: string | null;
  phones?: string[];
  exclude?: boolean;
  groups?: string[];
};

/** Insert a new contact in SQLite and append contacts.csv; returns the contact. */
export function createContact(input: ContactCreate): ContactDetail {
  const firstName = input.firstName?.trim() || null;
  const lastName = input.lastName?.trim() || null;
  if (!firstName && !lastName) {
    throw new Error("first or last name required");
  }
  const phones = (input.phones ?? []).map((p) => p.trim()).filter(Boolean);
  const exclude = input.exclude ?? false;
  const preferredPhone = phones[0] ?? null;
  const groups = (input.groups ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !RESERVED_GROUP_NAMES.has(t.toLowerCase()));

  let newId = 0;
  const writeDb = new Database(dbPath());
  try {
    const tx = writeDb.transaction(() => {
      for (const phone of phones) {
        const owner = phoneOwner(writeDb, phone);
        if (owner != null) {
          throw new Error(`phone ${phone} already belongs to another contact`);
        }
      }

      const result = writeDb
        .prepare(
          `INSERT INTO contacts (first_name, last_name, exclude, preferred_phone)
           VALUES (?, ?, ?, ?)`,
        )
        .run(firstName, lastName, exclude ? 1 : 0, preferredPhone);
      newId = Number(result.lastInsertRowid);

      const insertPhone = writeDb.prepare(
        `INSERT INTO contact_phones (phone_e164, contact_id) VALUES (?, ?)`,
      );
      for (const phone of phones) {
        insertPhone.run(phone, newId);
      }
      clearTrashedHandles(writeDb, phones);

      if (groups.length > 0) {
        const insertTag = writeDb.prepare(
          `INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`,
        );
        for (const name of groups) {
          const tagId = ensureTagId(writeDb, name);
          insertTag.run(newId, tagId);
        }
      }
    });
    tx();
  } finally {
    writeDb.close();
  }

  resetDb();
  appendContactsCsv({
    phones,
    firstName,
    lastName,
    exclude,
    tags: groups,
  });

  const created = getContact(newId);
  if (!created) {
    throw new Error("contact missing after create");
  }
  return created;
}

function ensureTagId(db: Database.Database, name: string): number {
  assertAllowedGroupName(name);
  db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(name);
  const row = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(name) as
    | { id: number }
    | undefined;
  if (!row) throw new Error(`failed to ensure tag ${name}`);
  return row.id;
}

function findTagId(db: Database.Database, name: string): number | null {
  const row = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(name) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}


export function createGroup(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("name required");
  assertAllowedGroupName(trimmed);

  const writeDb = new Database(dbPath());
  try {
    const existing = writeDb
      .prepare(`SELECT name FROM tags WHERE name = ? COLLATE NOCASE`)
      .get(trimmed) as { name: string } | undefined;
    if (existing) {
      throw new Error("group already exists");
    }
    writeDb.prepare(`INSERT INTO tags (name) VALUES (?)`).run(trimmed);
  } finally {
    writeDb.close();
  }

  resetDb();
  return trimmed;
}

export function renameGroup(from: string, to: string): string {
  const oldName = from.trim();
  const newName = to.trim();
  if (!oldName || !newName) throw new Error("name required");
  assertAllowedGroupName(newName);
  if (oldName.toLowerCase() === newName.toLowerCase()) {
    // Same name ignoring case — allow casing fix
    if (oldName === newName) return newName;
  }

  const writeDb = new Database(dbPath());
  try {
    const id = findTagId(writeDb, oldName);
    if (id == null) throw new Error("group not found");

    const clash = writeDb
      .prepare(
        `SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id != ?`,
      )
      .get(newName, id) as { id: number } | undefined;
    if (clash) throw new Error("group already exists");

    writeDb.prepare(`UPDATE tags SET name = ? WHERE id = ?`).run(newName, id);
  } finally {
    writeDb.close();
  }

  resetDb();
  rewriteCsvTags((tag) =>
    tag.toLowerCase() === oldName.toLowerCase() ? newName : tag,
  );
  return newName;
}

export function deleteGroup(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("name required");

  const writeDb = new Database(dbPath());
  try {
    const id = findTagId(writeDb, trimmed);
    if (id == null) throw new Error("group not found");
    writeDb.prepare(`DELETE FROM contact_tags WHERE tag_id = ?`).run(id);
    writeDb.prepare(`DELETE FROM tags WHERE id = ?`).run(id);
  } finally {
    writeDb.close();
  }

  resetDb();
  rewriteCsvTags((tag) =>
    tag.toLowerCase() === trimmed.toLowerCase() ? null : tag,
  );
}

function phoneOwner(
  db: Database.Database,
  phone: string,
): number | null {
  const row = db
    .prepare(`SELECT contact_id FROM contact_phones WHERE phone_e164 = ?`)
    .get(phone) as { contact_id: number } | undefined;
  return row?.contact_id ?? null;
}

/**
 * Retarget message/conversation handles when a contact phone changes so the
 * person stays linked to their threads (list filters require phone↔message join).
 */
function remapPhoneHandle(
  db: Database.Database,
  contactId: number,
  from: string,
  to: string,
): void {
  if (from === to) return;

  const owner = phoneOwner(db, to);
  if (owner != null && owner !== contactId) {
    throw new Error(`phone ${to} already belongs to another contact`);
  }

  // Prefer updating the PK in place; if `to` already exists on this contact,
  // drop the old row instead (merge).
  if (owner === contactId) {
    db.prepare(`DELETE FROM contact_phones WHERE phone_e164 = ?`).run(from);
  } else {
    db.prepare(
      `UPDATE contact_phones SET phone_e164 = ? WHERE phone_e164 = ?`,
    ).run(to, from);
  }

  db.prepare(
    `UPDATE conversations SET chat_identifier = ? WHERE chat_identifier = ?`,
  ).run(to, from);
  db.prepare(`UPDATE participants SET handle = ? WHERE handle = ?`).run(to, from);
  db.prepare(`UPDATE messages SET sender = ? WHERE sender = ?`).run(to, from);
  db.prepare(`UPDATE tapbacks SET sender = ? WHERE sender = ?`).run(to, from);
}

function syncContactPhones(
  db: Database.Database,
  contactId: number,
  oldPhones: string[],
  newPhones: string[],
): void {
  const shared = Math.min(oldPhones.length, newPhones.length);
  for (let i = 0; i < shared; i++) {
    const from = oldPhones[i]!;
    const to = newPhones[i]!;
    if (from !== to) {
      remapPhoneHandle(db, contactId, from, to);
    }
  }

  for (let i = shared; i < oldPhones.length; i++) {
    db.prepare(`DELETE FROM contact_phones WHERE phone_e164 = ?`).run(
      oldPhones[i],
    );
  }

  const insert = db.prepare(
    `INSERT INTO contact_phones (phone_e164, contact_id) VALUES (?, ?)`,
  );
  for (let i = shared; i < newPhones.length; i++) {
    const phone = newPhones[i]!;
    const owner = phoneOwner(db, phone);
    if (owner != null && owner !== contactId) {
      throw new Error(`phone ${phone} already belongs to another contact`);
    }
    if (owner == null) {
      insert.run(phone, contactId);
    }
  }
}

/** Update contact fields in SQLite and contacts.csv; returns refreshed contact. */
export function patchContact(
  id: number,
  patch: ContactPatch,
): ContactDetail {
  const existing = getContact(id);
  if (!existing) {
    throw new Error("contact not found");
  }

  const exclude = patch.exclude ?? existing.exclude;
  const groups = patch.groups ?? existing.groups;
  const firstName =
    patch.firstName !== undefined
      ? patch.firstName?.trim() || null
      : existing.firstName;
  const lastName =
    patch.lastName !== undefined
      ? patch.lastName?.trim() || null
      : existing.lastName;
  const phones =
    patch.phones !== undefined
      ? patch.phones.map((p) => p.trim()).filter(Boolean)
      : existing.phones;
  const preferredPhone = phones[0] ?? null;

  const writeDb = new Database(dbPath());
  try {
    const tx = writeDb.transaction(() => {
      if (patch.phones) {
        syncContactPhones(writeDb, id, existing.phones, phones);
        clearTrashedHandles(writeDb, phones);
      }

      writeDb
        .prepare(
          `UPDATE contacts
           SET first_name = ?, last_name = ?, exclude = ?, preferred_phone = ?
           WHERE id = ?`,
        )
        .run(firstName, lastName, exclude ? 1 : 0, preferredPhone, id);

      if (patch.groups) {
        writeDb.prepare(`DELETE FROM contact_tags WHERE contact_id = ?`).run(id);
        const insert = writeDb.prepare(
          `INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`,
        );
        for (const name of groups) {
          const tagId = ensureTagId(writeDb, name);
          insert.run(id, tagId);
        }
      }
    });
    tx();
  } finally {
    writeDb.close();
  }

  resetDb();
  updateContactsCsv(
    existing.phones,
    { firstName: existing.firstName, lastName: existing.lastName },
    {
      exclude,
      tags: groups,
      firstName: patch.firstName !== undefined ? firstName : undefined,
      lastName: patch.lastName !== undefined ? lastName : undefined,
      phones: patch.phones !== undefined ? phones : undefined,
    },
  );

  const updated = getContact(id);
  if (!updated) {
    throw new Error("contact missing after update");
  }
  return updated;
}

/** Append a phone/email handle to an existing contact (for Unassigned assign). */
export function addPhoneToContact(id: number, phone: string): ContactDetail {
  const existing = getContact(id);
  if (!existing) throw new Error("contact not found");
  const trimmed = phone.trim();
  if (!trimmed) throw new Error("phone required");
  if (existing.phones.includes(trimmed)) return existing;
  return patchContact(id, { phones: [...existing.phones, trimmed] });
}


/** Delete contacts from SQLite and contacts.csv. */
export function deleteContacts(ids: number[]): number {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))];
  if (unique.length === 0) return 0;

  const snapshots: Array<{
    phones: string[];
    firstName: string | null;
    lastName: string | null;
  }> = [];
  for (const id of unique) {
    const existing = getContact(id);
    if (!existing) continue;
    snapshots.push({
      phones: existing.phones,
      firstName: existing.firstName,
      lastName: existing.lastName,
    });
  }
  if (snapshots.length === 0) {
    throw new Error("contact not found");
  }

  const writeDb = new Database(dbPath());
  try {
    const del = writeDb.prepare(`DELETE FROM contacts WHERE id = ?`);
    const tx = writeDb.transaction(() => {
      for (const id of unique) {
        del.run(id);
      }
    });
    tx();
  } finally {
    writeDb.close();
  }

  resetDb();
  removeContactsCsv(snapshots);
  return snapshots.length;
}
