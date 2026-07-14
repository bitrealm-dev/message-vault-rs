import Database from "better-sqlite3";
import { dbPath } from "./paths";
import { getContact, resetDb } from "./db";
import {
  appendContactsCsv,
  removeContactsCsv,
  rewriteCsvGroups,
  updateContactsCsv,
} from "./contactsCsv";
import {
  isEmailHandle,
  phoneHandlesOnly,
  preferredPhoneHandle,
} from "./handleKind";
import { clearTrashedHandles } from "./handlesWrite";
import type { ContactDetail } from "./types";
import {
  isReservedGroupName,
  RESERVED_GROUP_NAMES,
  reservedGroupError,
} from "./reservedGroups";
import { assertNotOwnerHandle, assertVaultWritable } from "./owner";

export type ContactPatch = {
  exclude?: boolean;
  contactGroups?: string[];
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
  contactGroups?: string[];
};

/** Insert a new contact in SQLite and append contacts.csv; returns the contact. */
export function createContact(input: ContactCreate): ContactDetail {
  assertVaultWritable();
  const firstName = input.firstName?.trim() || null;
  const lastName = input.lastName?.trim() || null;
  if (!firstName && !lastName) {
    throw new Error("first or last name required");
  }
  const phones = (input.phones ?? []).map((p) => p.trim()).filter(Boolean);
  const csvPhones = phoneHandlesOnly(phones);
  if (csvPhones.length === 0) {
    throw new Error(
      "at least one phone number required (emails alone cannot create a contact)",
    );
  }
  const exclude = input.exclude ?? false;
  const preferredHandle = preferredPhoneHandle(phones);
  const contactGroups = (input.contactGroups ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !RESERVED_GROUP_NAMES.has(t.toLowerCase()));

  for (const phone of phones) {
    assertNotOwnerHandle(phone);
  }

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
          `INSERT INTO contacts (first_name, last_name, exclude, preferred_handle)
           VALUES (?, ?, ?, ?)`,
        )
        .run(firstName, lastName, exclude ? 1 : 0, preferredHandle);
      newId = Number(result.lastInsertRowid);

      const insertPhone = writeDb.prepare(
        `INSERT INTO contact_handles (handle, contact_id) VALUES (?, ?)`,
      );
      for (const phone of phones) {
        insertPhone.run(phone, newId);
      }
      clearTrashedHandles(writeDb, phones);

      if (contactGroups.length > 0) {
        const insertMember = writeDb.prepare(
          `INSERT OR IGNORE INTO contact_group_members (contact_id, group_id) VALUES (?, ?)`,
        );
        for (const name of contactGroups) {
          const groupId = ensureGroupId(writeDb, name);
          insertMember.run(newId, groupId);
        }
      }
    });
    tx();
  } finally {
    writeDb.close();
  }

  resetDb();
  appendContactsCsv({
    phones: csvPhones,
    firstName,
    lastName,
    exclude,
    groups: contactGroups,
  });

  const created = getContact(newId);
  if (!created) {
    throw new Error("contact missing after create");
  }
  return created;
}

function ensureGroupId(db: Database.Database, name: string): number {
  assertAllowedGroupName(name);
  db.prepare(`INSERT OR IGNORE INTO contact_groups (name) VALUES (?)`).run(name);
  const row = db
    .prepare(`SELECT id FROM contact_groups WHERE name = ?`)
    .get(name) as { id: number } | undefined;
  if (!row) throw new Error(`failed to ensure group ${name}`);
  return row.id;
}

function findGroupId(db: Database.Database, name: string): number | null {
  const row = db
    .prepare(`SELECT id FROM contact_groups WHERE name = ?`)
    .get(name) as { id: number } | undefined;
  return row?.id ?? null;
}


export function createGroup(name: string): string {
  assertVaultWritable();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("name required");
  assertAllowedGroupName(trimmed);

  const writeDb = new Database(dbPath());
  try {
    const existing = writeDb
      .prepare(`SELECT name FROM contact_groups WHERE name = ? COLLATE NOCASE`)
      .get(trimmed) as { name: string } | undefined;
    if (existing) {
      throw new Error("group already exists");
    }
    writeDb.prepare(`INSERT INTO contact_groups (name) VALUES (?)`).run(trimmed);
  } finally {
    writeDb.close();
  }

  resetDb();
  return trimmed;
}

export function renameGroup(from: string, to: string): string {
  assertVaultWritable();
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
    const id = findGroupId(writeDb, oldName);
    if (id == null) throw new Error("group not found");

    const clash = writeDb
      .prepare(
        `SELECT id FROM contact_groups WHERE name = ? COLLATE NOCASE AND id != ?`,
      )
      .get(newName, id) as { id: number } | undefined;
    if (clash) throw new Error("group already exists");

    writeDb
      .prepare(`UPDATE contact_groups SET name = ? WHERE id = ?`)
      .run(newName, id);
  } finally {
    writeDb.close();
  }

  resetDb();
  rewriteCsvGroups((group) =>
    group.toLowerCase() === oldName.toLowerCase() ? newName : group,
  );
  return newName;
}

export function deleteGroup(name: string): void {
  assertVaultWritable();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("name required");

  const writeDb = new Database(dbPath());
  try {
    const id = findGroupId(writeDb, trimmed);
    if (id == null) throw new Error("group not found");
    writeDb
      .prepare(`DELETE FROM contact_group_members WHERE group_id = ?`)
      .run(id);
    writeDb.prepare(`DELETE FROM contact_groups WHERE id = ?`).run(id);
  } finally {
    writeDb.close();
  }

  resetDb();
  rewriteCsvGroups((group) =>
    group.toLowerCase() === trimmed.toLowerCase() ? null : group,
  );
}

function phoneOwner(
  db: Database.Database,
  phone: string,
): number | null {
  const row = db
    .prepare(`SELECT contact_id FROM contact_handles WHERE handle = ?`)
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
    db.prepare(`DELETE FROM contact_handles WHERE handle = ?`).run(from);
  } else {
    db.prepare(
      `UPDATE contact_handles SET handle = ? WHERE handle = ?`,
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
    db.prepare(`DELETE FROM contact_handles WHERE handle = ?`).run(
      oldPhones[i],
    );
  }

  const insert = db.prepare(
    `INSERT INTO contact_handles (handle, contact_id) VALUES (?, ?)`,
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
  assertVaultWritable();
  const existing = getContact(id);
  if (!existing) {
    throw new Error("contact not found");
  }

  const exclude = patch.exclude ?? existing.exclude;
  const contactGroups = patch.contactGroups ?? existing.contactGroups;
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
  const preferredHandle = preferredPhoneHandle(phones);
  const csvPhones = phoneHandlesOnly(phones);
  const existingCsvPhones = phoneHandlesOnly(existing.phones);
  const csvPhonesChanged =
    patch.phones !== undefined &&
    (csvPhones.length !== existingCsvPhones.length ||
      csvPhones.some((p, i) => p !== existingCsvPhones[i]));

  if (patch.phones !== undefined && csvPhones.length === 0) {
    throw new Error(
      "at least one phone number required (emails alone cannot be a contact)",
    );
  }
  if (patch.phones !== undefined) {
    for (const phone of phones) {
      assertNotOwnerHandle(phone);
    }
  }

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
           SET first_name = ?, last_name = ?, exclude = ?, preferred_handle = ?
           WHERE id = ?`,
        )
        .run(firstName, lastName, exclude ? 1 : 0, preferredHandle, id);

      if (patch.contactGroups) {
        writeDb
          .prepare(`DELETE FROM contact_group_members WHERE contact_id = ?`)
          .run(id);
        const insert = writeDb.prepare(
          `INSERT OR IGNORE INTO contact_group_members (contact_id, group_id) VALUES (?, ?)`,
        );
        for (const name of contactGroups) {
          const groupId = ensureGroupId(writeDb, name);
          insert.run(id, groupId);
        }
      }
    });
    tx();
  } finally {
    writeDb.close();
  }

  resetDb();
  updateContactsCsv(
    existingCsvPhones,
    { firstName: existing.firstName, lastName: existing.lastName },
    {
      exclude,
      groups: contactGroups,
      firstName: patch.firstName !== undefined ? firstName : undefined,
      lastName: patch.lastName !== undefined ? lastName : undefined,
      phones: csvPhonesChanged ? csvPhones : undefined,
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
  assertVaultWritable();
  const existing = getContact(id);
  if (!existing) throw new Error("contact not found");
  const trimmed = phone.trim();
  if (!trimmed) throw new Error("phone required");
  assertNotOwnerHandle(trimmed);
  if (existing.phones.includes(trimmed)) return existing;

  // Emails live in SQLite only — never rewrite contacts.csv phones.
  if (isEmailHandle(trimmed)) {
    const writeDb = new Database(dbPath());
    try {
      const owner = phoneOwner(writeDb, trimmed);
      if (owner != null && owner !== id) {
        throw new Error(`phone ${trimmed} already belongs to another contact`);
      }
      if (owner == null) {
        writeDb
          .prepare(
            `INSERT INTO contact_handles (handle, contact_id) VALUES (?, ?)`,
          )
          .run(trimmed, id);
        clearTrashedHandles(writeDb, [trimmed]);
      }
    } finally {
      writeDb.close();
    }
    resetDb();
    const updated = getContact(id);
    if (!updated) throw new Error("contact missing after update");
    return updated;
  }

  return patchContact(id, { phones: [...existing.phones, trimmed] });
}

/**
 * Remove a phone/email handle from a contact. Does not delete conversations
 * or messages. Used to undo assign-from-unassigned.
 */
export function removePhoneFromContact(
  id: number,
  phone: string,
): ContactDetail {
  assertVaultWritable();
  const existing = getContact(id);
  if (!existing) throw new Error("contact not found");
  const trimmed = phone.trim();
  if (!trimmed) throw new Error("phone required");
  if (!existing.phones.includes(trimmed)) {
    throw new Error("handle not on contact");
  }

  if (isEmailHandle(trimmed)) {
    const writeDb = new Database(dbPath());
    try {
      const owner = phoneOwner(writeDb, trimmed);
      if (owner != null && owner !== id) {
        throw new Error(`phone ${trimmed} already belongs to another contact`);
      }
      writeDb.prepare(`DELETE FROM contact_handles WHERE handle = ?`).run(trimmed);
      const preferred = preferredPhoneHandle(
        existing.phones.filter((p) => p !== trimmed),
      );
      writeDb
        .prepare(`UPDATE contacts SET preferred_handle = ? WHERE id = ?`)
        .run(preferred, id);
    } finally {
      writeDb.close();
    }
    resetDb();
    const updated = getContact(id);
    if (!updated) throw new Error("contact missing after update");
    return updated;
  }

  const nextPhones = existing.phones.filter((p) => p !== trimmed);
  if (phoneHandlesOnly(nextPhones).length === 0) {
    throw new Error(
      "cannot remove last phone number (emails alone cannot be a contact)",
    );
  }
  return patchContact(id, { phones: nextPhones });
}

/**
 * Recreate a deleted group and re-attach member contacts.
 * Contacts that no longer exist are skipped.
 */
export function restoreGroup(
  name: string,
  memberContactIds: number[],
): string {
  assertVaultWritable();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("name required");
  assertAllowedGroupName(trimmed);

  const created = createGroup(trimmed);
  for (const contactId of memberContactIds) {
    const contact = getContact(contactId);
    if (!contact) continue;
    if (contact.contactGroups.some((g) => g.toLowerCase() === created.toLowerCase())) {
      continue;
    }
    patchContact(contactId, {
      contactGroups: [...contact.contactGroups, created].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
    });
  }
  return created;
}

/** Delete contacts from SQLite and contacts.csv. */
export function deleteContacts(ids: number[]): number {
  assertVaultWritable();
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
      phones: phoneHandlesOnly(existing.phones),
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
