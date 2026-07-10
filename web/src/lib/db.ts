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

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(dbPath(), { readonly: true, fileMustExist: true });
    _db.pragma("foreign_keys = ON");
  }
  return _db;
}

function displayName(row: {
  nickname: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  preferred_phone: string | null;
}): string {
  if (row.nickname?.trim()) return row.nickname.trim();
  const parts = [row.first_name, row.middle_name, row.last_name]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];
  if (parts.length) return parts.join(" ");
  return row.preferred_phone ?? "Unknown";
}

function sortFields(row: {
  nickname: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_phone: string | null;
}): { sortFirst: string; sortLast: string; letter: string } {
  const first = (row.first_name || row.nickname || "").trim();
  const last = (row.last_name || row.nickname || row.first_name || "").trim();
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

function sectionSql(section: ContactSection): string {
  const hasMsg = hasMessagesSql();
  switch (section) {
    case "people":
      return `
        SELECT DISTINCT c.*
        FROM contacts c
        JOIN contact_groups cg ON cg.contact_id = c.id
        JOIN groups g ON g.id = cg.group_id AND g.name = 'People'
        WHERE c.hidden = 0
          AND c.id NOT IN (
            SELECT cg2.contact_id FROM contact_groups cg2
            JOIN groups g2 ON g2.id = cg2.group_id
            WHERE g2.name IN ('Historical', 'girls')
          )
          ${hasMsg}
      `;
    case "historical":
      return `
        SELECT DISTINCT c.*
        FROM contacts c
        JOIN contact_groups cg ON cg.contact_id = c.id
        JOIN groups g ON g.id = cg.group_id AND g.name = 'Historical'
        WHERE 1=1
          ${hasMsg}
      `;
    case "girls":
      return `
        SELECT DISTINCT c.*
        FROM contacts c
        JOIN contact_groups cg ON cg.contact_id = c.id
        JOIN groups g ON g.id = cg.group_id AND g.name = 'girls'
        WHERE c.hidden = 0
          ${hasMsg}
      `;
  }
}

export function listContacts(section: ContactSection): ContactListItem[] {
  const db = getDb();
  const rows = db
    .prepare(sectionSql(section))
    .all() as Array<{
    id: number;
    nickname: string | null;
    first_name: string | null;
    middle_name: string | null;
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
        ...sorts,
      };
    })
    .sort((a, b) =>
      a.sortLast.localeCompare(b.sortLast, undefined, { sensitivity: "base" }) ||
      a.sortFirst.localeCompare(b.sortFirst, undefined, { sensitivity: "base" }),
    );
}

export function getContact(id: number): ContactDetail | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, first_name, middle_name, last_name, nickname, email, hidden, preferred_phone
       FROM contacts WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number;
        first_name: string | null;
        middle_name: string | null;
        last_name: string | null;
        nickname: string | null;
        email: string | null;
        hidden: number;
        preferred_phone: string | null;
      }
    | undefined;
  if (!row) return null;

  const phones = db
    .prepare(`SELECT phone_e164 FROM contact_phones WHERE contact_id = ? ORDER BY phone_e164`)
    .all(id) as Array<{ phone_e164: string }>;

  const phoneList = phones.map((p) => p.phone_e164);
  const dateRange = contactDateRange(phoneList);

  const sorts = sortFields(row);
  return {
    id: row.id,
    displayName: displayName(row),
    preferredPhone: row.preferred_phone,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    nickname: row.nickname,
    email: row.email,
    hidden: row.hidden !== 0,
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
      `SELECT c.id AS conversation_id,
              CAST(substr(m.timestamp, 1, 4) AS INTEGER) AS year,
              COUNT(*) AS message_count,
              MIN(substr(m.timestamp, 1, 10)) AS date_start,
              MAX(substr(m.timestamp, 1, 10)) AS date_end
       FROM conversations c
       JOIN messages m ON m.conversation_id = c.id
       WHERE c.conv_type = 'individual'
         AND c.chat_identifier IN (${placeholders})
       GROUP BY c.id, year
       ORDER BY year DESC`,
    )
    .all(...phones) as Array<{
    conversation_id: number;
    year: number;
    message_count: number;
    date_start: string;
    date_end: string;
  }>;

  return rows.map((r) => ({
    conversationId: r.conversation_id,
    year: r.year,
    messageCount: r.message_count,
    dateStart: r.date_start,
    dateEnd: r.date_end,
  }));
}

export function contactGroupThreads(contactId: number): GroupThread[] {
  const phones = contactPhones(contactId);
  if (!phones.length) return [];
  const db = getDb();
  const placeholders = phones.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT c.id AS conversation_id,
              COALESCE(c.group_title, c.chat_identifier) AS title,
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
       ORDER BY year DESC, title COLLATE NOCASE`,
    )
    .all(...phones) as Array<{
    conversation_id: number;
    title: string;
    year: number;
    message_count: number;
    date_start: string;
    date_end: string;
  }>;

  return rows.map((r) => ({
    conversationId: r.conversation_id,
    title: r.title,
    year: r.year,
    messageCount: r.message_count,
    dateStart: r.date_start,
    dateEnd: r.date_end,
  }));
}

export function listGroups(): GroupListItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id,
              COALESCE(c.group_title, c.chat_identifier) AS title,
              COUNT(m.id) AS message_count,
              MIN(substr(m.timestamp, 1, 10)) AS date_start,
              MAX(substr(m.timestamp, 1, 10)) AS date_end
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.conv_type = 'group'
       GROUP BY c.id
       HAVING message_count > 0
       ORDER BY title COLLATE NOCASE`,
    )
    .all() as Array<{
    id: number;
    title: string;
    message_count: number;
    date_start: string | null;
    date_end: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    messageCount: r.message_count,
    dateStart: r.date_start,
    dateEnd: r.date_end,
  }));
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
    conversationId: r.conversation_id,
    year: r.year,
    messageCount: r.message_count,
    dateStart: r.date_start,
    dateEnd: r.date_end,
  }));
}

export function messagesForConversationYear(
  conversationId: number,
  year: number,
): MessageRow[] {
  const db = getDb();
  const owner = loadOwner();
  const rows = db
    .prepare(
      `SELECT m.id, m.timestamp, m.is_from_me, m.sender, m.body, m.is_announcement,
              c.nickname, c.first_name, c.middle_name, c.last_name, c.preferred_phone,
              p.name_hint
       FROM messages m
       LEFT JOIN contact_phones cp ON cp.phone_e164 = m.sender
       LEFT JOIN contacts c ON c.id = cp.contact_id
       LEFT JOIN participants p
         ON p.conversation_id = m.conversation_id AND p.handle = m.sender
       WHERE m.conversation_id = ?
         AND CAST(substr(m.timestamp, 1, 4) AS INTEGER) = ?
       ORDER BY m.sort_order, m.timestamp`,
    )
    .all(conversationId, year) as Array<{
    id: number;
    timestamp: string;
    is_from_me: number;
    sender: string | null;
    body: string | null;
    is_announcement: number;
    nickname: string | null;
    first_name: string | null;
    middle_name: string | null;
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
        nickname: r.nickname,
        first_name: r.first_name,
        middle_name: r.middle_name,
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
    people: listContacts("people").length,
    historical: listContacts("historical").length,
    girls: listContacts("girls").length,
    groups: listGroups().length,
    messages: (
      getDb().prepare(`SELECT COUNT(*) AS n FROM messages`).get() as { n: number }
    ).n,
    contacts: (
      getDb().prepare(`SELECT COUNT(*) AS n FROM contacts`).get() as { n: number }
    ).n,
  };
}
