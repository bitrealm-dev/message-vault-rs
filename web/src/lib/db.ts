import Database from "better-sqlite3";
import { loadOwner } from "./config";
import { dbPath } from "./paths";
import type {
  ContactDetail,
  ContactListItem,
  ContactSection,
  GroupListItem,
  GroupThread,
  HomeStats,
  MessageRow,
  YearThread,
} from "./types";
import { tagSlug } from "./tagSlug";

export { tagSlug };

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(dbPath(), { readonly: true, fileMustExist: true });
    _db.pragma("foreign_keys = ON");
  }
  return _db;
}

/** Close the cached readonly connection so the next read sees recent writes. */
export function resetDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function displayName(row: {
  first_name: string | null;
  last_name: string | null;
  preferred_phone: string | null;
}): string {
  const parts = [row.first_name, row.last_name]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];
  if (parts.length) return parts.join(" ");
  return row.preferred_phone ?? "Unknown";
}

function sortFields(row: {
  first_name: string | null;
  last_name: string | null;
  preferred_phone: string | null;
}): { sortFirst: string; sortLast: string; letter: string } {
  const first = (row.first_name || "").trim();
  const last = (row.last_name || row.first_name || "").trim();
  const sortFirst = first || row.preferred_phone || "Unknown";
  const sortLast = last || row.preferred_phone || "Unknown";
  const letterSrc = sortLast;
  const ch = letterSrc.charAt(0).toUpperCase();
  const letter = ch >= "A" && ch <= "Z" ? ch : "#";
  return { sortFirst, sortLast, letter };
}

function hasMessagesSql(): string {
  return `
    AND (
      EXISTS (
        SELECT 1
        FROM contact_phones cp
        JOIN conversations conv ON conv.conv_type = 'individual'
          AND conv.chat_identifier = cp.phone_e164
        JOIN messages m ON m.conversation_id = conv.id
        WHERE cp.contact_id = c.id
        LIMIT 1
      )
      OR EXISTS (
        SELECT 1
        FROM contact_phones cp
        JOIN participants p ON p.handle = cp.phone_e164
        JOIN messages m ON m.conversation_id = p.conversation_id
        WHERE cp.contact_id = c.id
        LIMIT 1
      )
    )
  `;
}

const RESERVED_TAG_LABELS = new Set(
  ["home", "all", "current", "historical", "groups"].map((s) => s.toLowerCase()),
);

export function listTags(): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT name FROM tags
       ORDER BY name COLLATE NOCASE`,
    )
    .all() as Array<{ name: string }>;
  return rows
    .map((r) => r.name)
    .filter((name) => !RESERVED_TAG_LABELS.has(name.trim().toLowerCase()));
}

export function tagFromSlug(slug: string): string | null {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  for (const name of listTags()) {
    if (tagSlug(name) === normalized) return name;
  }
  return null;
}

function sectionSql(section: ContactSection): { sql: string; params: unknown[] } {
  const hasMsg = hasMessagesSql();
  if (typeof section === "object" && "tag" in section) {
    // Tag filters list everyone with the tag (displayable), even if they
    // have no imported messages yet — otherwise Travel/Celebration/etc. look empty.
    return {
      sql: `
        SELECT DISTINCT c.*
        FROM contacts c
        JOIN contact_tags ct ON ct.contact_id = c.id
        JOIN tags t ON t.id = ct.tag_id AND t.name = ?
        WHERE c.display = 1
      `,
      params: [section.tag],
    };
  }
  switch (section) {
    case "all":
      return {
        sql: `
          SELECT DISTINCT c.*
          FROM contacts c
          WHERE c.display = 1
            ${hasMsg}
        `,
        params: [],
      };
    case "current":
      return {
        sql: `
          SELECT DISTINCT c.*
          FROM contacts c
          WHERE c.display = 1
            AND c.status = 'current'
            ${hasMsg}
        `,
        params: [],
      };
    case "historical":
      return {
        sql: `
          SELECT DISTINCT c.*
          FROM contacts c
          WHERE c.display = 1
            AND c.status = 'historical'
            ${hasMsg}
        `,
        params: [],
      };
  }
}

export function listContacts(section: ContactSection): ContactListItem[] {
  const db = getDb();
  const { sql, params } = sectionSql(section);
  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    first_name: string | null;
    last_name: string | null;
    preferred_phone: string | null;
  }>;

  return rows
    .map((row) => {
      const name = displayName(row);
      const sorts = sortFields(row);
      return {
        id: row.id,
        displayName: name,
        preferredPhone: row.preferred_phone,
        firstName: row.first_name,
        lastName: row.last_name,
        ...sorts,
      };
    })
    .sort(
      (a, b) =>
        a.sortLast.localeCompare(b.sortLast, undefined, { sensitivity: "base" }) ||
        a.sortFirst.localeCompare(b.sortFirst, undefined, { sensitivity: "base" }),
    );
}

export function getContact(id: number): ContactDetail | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, first_name, last_name, display, status, preferred_phone
       FROM contacts WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number;
        first_name: string | null;
        last_name: string | null;
        display: number;
        status: string;
        preferred_phone: string | null;
      }
    | undefined;
  if (!row) return null;

  const phones = db
    .prepare(`SELECT phone_e164 FROM contact_phones WHERE contact_id = ? ORDER BY phone_e164`)
    .all(id) as Array<{ phone_e164: string }>;

  const tags = db
    .prepare(
      `SELECT t.name FROM contact_tags ct
       JOIN tags t ON t.id = ct.tag_id
       WHERE ct.contact_id = ?
       ORDER BY t.name COLLATE NOCASE`,
    )
    .all(id) as Array<{ name: string }>;

  const phoneList = phones.map((p) => p.phone_e164);
  const dateRange = contactDateRange(phoneList);

  const sorts = sortFields(row);
  return {
    id: row.id,
    displayName: displayName(row),
    preferredPhone: row.preferred_phone,
    firstName: row.first_name,
    lastName: row.last_name,
    display: row.display !== 0,
    status: row.status,
    tags: tags.map((t) => t.name),
    phones: phoneList,
    dateStart: dateRange?.start ?? null,
    dateEnd: dateRange?.end ?? null,
    ...sorts,
  };
}

function contactDateRange(
  phones: string[],
): { start: string; end: string } | null {
  if (!phones.length) return null;
  const db = getDb();
  const placeholders = phones.map(() => "?").join(",");
  const row = db
    .prepare(
      `SELECT MIN(substr(m.timestamp, 1, 10)) AS start, MAX(substr(m.timestamp, 1, 10)) AS end
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.conv_type = 'individual'
         AND c.chat_identifier IN (${placeholders})`,
    )
    .get(...phones) as { start: string | null; end: string | null } | undefined;
  if (!row?.start || !row?.end) return null;
  return { start: row.start, end: row.end };
}

export function contactPhones(contactId: number): string[] {
  const db = getDb();
  return (
    db
      .prepare(`SELECT phone_e164 FROM contact_phones WHERE contact_id = ?`)
      .all(contactId) as Array<{ phone_e164: string }>
  ).map((r) => r.phone_e164);
}

export function contactYearlyThreads(contactId: number): YearThread[] {
  const phones = contactPhones(contactId);
  if (!phones.length) return [];
  const db = getDb();
  const placeholders = phones.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT CAST(substr(m.timestamp, 1, 4) AS INTEGER) AS year,
              COUNT(*) AS message_count,
              MIN(substr(m.timestamp, 1, 10)) AS date_start,
              MAX(substr(m.timestamp, 1, 10)) AS date_end,
              GROUP_CONCAT(DISTINCT c.id) AS conversation_ids
       FROM conversations c
       JOIN messages m ON m.conversation_id = c.id
       WHERE c.conv_type = 'individual'
         AND c.chat_identifier IN (${placeholders})
       GROUP BY year
       ORDER BY year DESC`,
    )
    .all(...phones) as Array<{
    year: number;
    message_count: number;
    date_start: string;
    date_end: string;
    conversation_ids: string;
  }>;

  return rows.map((r) => ({
    year: r.year,
    messageCount: r.message_count,
    dateStart: r.date_start,
    dateEnd: r.date_end,
    conversationIds: r.conversation_ids
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id)),
  }));
}

const MAX_VISIBLE_NAMES = 8;

function isGenericGroupTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const t = title.trim();
  if (!t) return true;
  // iMessage chat identifiers look like chat31771234567890...
  if (/^chat\d+/i.test(t)) return true;
  return false;
}

function looksLikePhone(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (t.startsWith("+") && /^[+\d\s().-]+$/.test(t)) return true;
  const digits = t.replace(/\D/g, "");
  return digits.length >= 7 && digits.length === t.replace(/[\s().+-]/g, "").length;
}

function participantLabel(row: {
  first_name: string | null;
  last_name: string | null;
  name_hint: string | null;
  handle: string;
}): { name: string; unknown: boolean } {
  const first = row.first_name?.trim() ?? "";
  const last = row.last_name?.trim() ?? "";
  const full = `${first} ${last}`.trim();
  if (full) return { name: full, unknown: false };
  const hint = row.name_hint?.trim();
  if (hint && !looksLikePhone(hint)) return { name: hint, unknown: false };
  return { name: hint || row.handle, unknown: true };
}

function formatPeopleTitle(
  labels: Array<{ name: string; unknown: boolean }>,
): {
  short: string;
  full: string;
  count: number;
} {
  const seen = new Set<string>();
  const unique: Array<{ name: string; unknown: boolean }> = [];
  for (const label of labels) {
    if (!label.name || seen.has(label.name)) continue;
    seen.add(label.name);
    unique.push(label);
  }

  unique.sort((a, b) => {
    if (a.unknown !== b.unknown) return a.unknown ? 1 : -1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const names = unique.map((l) => l.name);
  const full = names.join(" · ");
  if (names.length === 0) {
    return { short: "Group chat", full: "Group chat", count: 0 };
  }
  if (names.length <= MAX_VISIBLE_NAMES) {
    return { short: full, full, count: names.length };
  }
  const shown = names.slice(0, MAX_VISIBLE_NAMES).join(" · ");
  return {
    short: `${shown} +${names.length - MAX_VISIBLE_NAMES}`,
    full,
    count: names.length,
  };
}

/** Resolve people labels for group conversations, excluding owner (+ optional focus contact). */
function groupPeopleTitles(
  conversationIds: number[],
  excludePhones: string[] = [],
): Map<
  number,
  { title: string; titleFull: string; namedTitle: string | null; participantCount: number }
> {
  const out = new Map<
    number,
    { title: string; titleFull: string; namedTitle: string | null; participantCount: number }
  >();
  if (!conversationIds.length) return out;

  const db = getDb();
  const owner = loadOwner();
  const exclude = new Set(
    [owner.phone_e164, ...excludePhones].filter(Boolean).map((p) => p.trim()),
  );

  const placeholders = conversationIds.map(() => "?").join(",");
  const meta = db
    .prepare(
      `SELECT id, group_title FROM conversations WHERE id IN (${placeholders})`,
    )
    .all(...conversationIds) as Array<{ id: number; group_title: string | null }>;
  const namedById = new Map(
    meta.map((r) => [
      r.id,
      isGenericGroupTitle(r.group_title) ? null : (r.group_title?.trim() ?? null),
    ]),
  );

  const rows = db
    .prepare(
      `SELECT p.conversation_id, p.handle, p.name_hint,
              c.first_name, c.last_name
       FROM participants p
       LEFT JOIN contact_phones cp ON cp.phone_e164 = p.handle
       LEFT JOIN contacts c ON c.id = cp.contact_id
       WHERE p.conversation_id IN (${placeholders})`,
    )
    .all(...conversationIds) as Array<{
    conversation_id: number;
    handle: string;
    name_hint: string | null;
    first_name: string | null;
    last_name: string | null;
  }>;

  const byConv = new Map<number, Array<{ name: string; unknown: boolean }>>();
  for (const r of rows) {
    if (exclude.has(r.handle.trim())) continue;
    const list = byConv.get(r.conversation_id) ?? [];
    list.push(participantLabel(r));
    byConv.set(r.conversation_id, list);
  }

  for (const id of conversationIds) {
    const people = formatPeopleTitle(byConv.get(id) ?? []);
    const namedTitle = namedById.get(id) ?? null;
    out.set(id, {
      title: people.short,
      titleFull: namedTitle ? `${namedTitle}\n${people.full}` : people.full,
      namedTitle,
      participantCount: people.count,
    });
  }
  return out;
}

export function contactGroupThreads(contactId: number): GroupThread[] {
  const phones = contactPhones(contactId);
  if (!phones.length) return [];
  const db = getDb();
  const placeholders = phones.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT c.id AS conversation_id,
              CAST(substr(m.timestamp, 1, 4) AS INTEGER) AS year,
              COUNT(*) AS message_count,
              MIN(substr(m.timestamp, 1, 10)) AS date_start,
              MAX(substr(m.timestamp, 1, 10)) AS date_end
       FROM conversations c
       JOIN participants p ON p.conversation_id = c.id
       JOIN messages m ON m.conversation_id = c.id
       WHERE c.conv_type = 'group'
         AND p.handle IN (${placeholders})
       GROUP BY c.id, year
       ORDER BY year DESC, c.id`,
    )
    .all(...phones) as Array<{
    conversation_id: number;
    year: number;
    message_count: number;
    date_start: string;
    date_end: string;
  }>;

  const titles = groupPeopleTitles(
    [...new Set(rows.map((r) => r.conversation_id))],
    phones,
  );

  return rows.map((r) => {
    const t = titles.get(r.conversation_id) ?? {
      title: "Group chat",
      titleFull: "Group chat",
      namedTitle: null,
      participantCount: 0,
    };
    return {
      conversationId: r.conversation_id,
      title: t.title,
      titleFull: t.titleFull,
      namedTitle: t.namedTitle,
      participantCount: t.participantCount,
      year: r.year,
      messageCount: r.message_count,
      dateStart: r.date_start,
      dateEnd: r.date_end,
    };
  });
}

export function listGroups(): GroupListItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id,
              COUNT(m.id) AS message_count,
              MIN(substr(m.timestamp, 1, 10)) AS date_start,
              MAX(substr(m.timestamp, 1, 10)) AS date_end
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.conv_type = 'group'
       GROUP BY c.id
       HAVING message_count > 0`,
    )
    .all() as Array<{
    id: number;
    message_count: number;
    date_start: string | null;
    date_end: string | null;
  }>;

  const titles = groupPeopleTitles(rows.map((r) => r.id));

  const items = rows.map((r) => {
    const t = titles.get(r.id) ?? {
      title: "Group chat",
      titleFull: "Group chat",
      namedTitle: null,
      participantCount: 0,
    };
    return {
      id: r.id,
      title: t.title,
      titleFull: t.titleFull,
      namedTitle: t.namedTitle,
      participantCount: t.participantCount,
      messageCount: r.message_count,
      dateStart: r.date_start,
      dateEnd: r.date_end,
    };
  });

  items.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );
  return items;
}

export function groupYearlyThreads(conversationId: number): YearThread[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT conversation_id,
              CAST(substr(timestamp, 1, 4) AS INTEGER) AS year,
              COUNT(*) AS message_count,
              MIN(substr(timestamp, 1, 10)) AS date_start,
              MAX(substr(timestamp, 1, 10)) AS date_end
       FROM messages
       WHERE conversation_id = ?
       GROUP BY year
       ORDER BY year DESC`,
    )
    .all(conversationId) as Array<{
    conversation_id: number;
    year: number;
    message_count: number;
    date_start: string;
    date_end: string;
  }>;

  return rows.map((r) => ({
    conversationIds: [r.conversation_id],
    year: r.year,
    messageCount: r.message_count,
    dateStart: r.date_start,
    dateEnd: r.date_end,
  }));
}

export function messagesForConversationYear(
  conversationIds: number | number[],
  year: number,
): MessageRow[] {
  const ids = (Array.isArray(conversationIds) ? conversationIds : [conversationIds]).filter(
    (id) => Number.isFinite(id),
  );
  if (!ids.length) return [];
  const db = getDb();
  const owner = loadOwner();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT m.id, m.timestamp, m.is_from_me, m.sender, m.body, m.is_announcement,
              c.first_name, c.last_name, c.preferred_phone,
              p.name_hint
       FROM messages m
       LEFT JOIN contact_phones cp ON cp.phone_e164 = m.sender
       LEFT JOIN contacts c ON c.id = cp.contact_id
       LEFT JOIN participants p
         ON p.conversation_id = m.conversation_id AND p.handle = m.sender
       WHERE m.conversation_id IN (${placeholders})
         AND CAST(substr(m.timestamp, 1, 4) AS INTEGER) = ?
       ORDER BY m.timestamp, m.sort_order`,
    )
    .all(...ids, year) as Array<{
    id: number;
    timestamp: string;
    is_from_me: number;
    sender: string | null;
    body: string | null;
    is_announcement: number;
    first_name: string | null;
    last_name: string | null;
    preferred_phone: string | null;
    name_hint: string | null;
  }>;

  const attStmt = db.prepare(
    `SELECT id, mime_type, original_name, assets_path, sha256
     FROM attachments WHERE message_id = ?`,
  );

  return rows.map((r) => {
    const isFromMe = r.is_from_me !== 0;
    let senderName: string;
    if (isFromMe) {
      senderName = owner.display_name;
    } else {
      senderName = displayName({
        first_name: r.first_name,
        last_name: r.last_name,
        preferred_phone: r.preferred_phone ?? r.sender,
      });
      if (senderName === (r.preferred_phone ?? r.sender) && r.name_hint) {
        senderName = r.name_hint;
      }
    }

    const attachments = (
      attStmt.all(r.id) as Array<{
        id: number;
        mime_type: string | null;
        original_name: string | null;
        assets_path: string | null;
        sha256: string | null;
      }>
    ).map((a) => ({
      id: a.id,
      mimeType: a.mime_type,
      originalName: a.original_name,
      assetsPath: a.assets_path,
      sha256: a.sha256,
    }));

    return {
      id: r.id,
      timestamp: r.timestamp,
      isFromMe,
      sender: r.sender,
      senderName,
      body: r.body,
      isAnnouncement: r.is_announcement !== 0,
      attachments,
    };
  });
}

export function homeStats(): HomeStats {
  return {
    all: listContacts("all").length,
    current: listContacts("current").length,
    historical: listContacts("historical").length,
    groups: listGroups().length,
    messages: (
      getDb().prepare(`SELECT COUNT(*) AS n FROM messages`).get() as { n: number }
    ).n,
    contacts: (
      getDb().prepare(`SELECT COUNT(*) AS n FROM contacts`).get() as { n: number }
    ).n,
  };
}
