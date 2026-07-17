import {
  collapseGroupConversations,
  groupYearRowsToCollapseThreads,
  type CollapsedGroupConversation,
} from "./groupChatList";
import type {
  GroupYearRow,
  TrashedContactItem,
  TrashedContactMessagesItem,
  UnassignedHandle,
} from "./types";

export type TrashCategory = "messages" | "groupMessages";

export type TrashListItem =
  | {
      key: string;
      category: "messages";
      trashKind: "contact" | "messages_only" | "unassigned";
      contactId?: number;
      handle: string;
      displayName: string;
      messageCount: number;
      trashedAt: string;
      unverified?: boolean;
    }
  | {
      key: string;
      category: "groupMessages";
      conversationId: number;
      displayName: string;
      messageCount: number;
      trashedAt: string;
      group: CollapsedGroupConversation;
    };

export const TRASH_CATEGORY_ORDER: TrashCategory[] = [
  "messages",
  "groupMessages",
];

export const TRASH_CATEGORY_LABEL: Record<TrashCategory, string> = {
  messages: "Messages",
  groupMessages: "Group Messages",
};

/** Compact display for SQLite `datetime('now')` timestamps. */
export function formatTrashedAt(trashedAt: string): string {
  const m = trashedAt.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  return trashedAt;
}

function byTrashedAtDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

export function buildTrashListItems(input: {
  handles: UnassignedHandle[];
  contacts: TrashedContactItem[];
  messagesOnly: TrashedContactMessagesItem[];
  groupChats: GroupYearRow[];
}): TrashListItem[] {
  const items: TrashListItem[] = [];

  for (const c of input.contacts) {
    const handle = c.preferredHandle;
    if (!handle) continue;
    items.push({
      key: `c:${c.contactId}`,
      category: "messages",
      trashKind: "contact",
      contactId: c.contactId,
      handle,
      displayName: c.displayName,
      messageCount: c.messageCount,
      trashedAt: c.trashedAt,
    });
  }

  for (const m of input.messagesOnly) {
    items.push({
      key: `m:${m.handle}`,
      category: "messages",
      trashKind: "messages_only",
      contactId: m.contactId,
      handle: m.handle,
      displayName: m.displayName,
      messageCount: m.messageCount,
      trashedAt: m.trashedAt,
    });
  }

  for (const h of input.handles) {
    items.push({
      key: `u:${h.handle}`,
      category: "messages",
      trashKind: "unassigned",
      handle: h.handle,
      displayName: h.displayName,
      messageCount: h.messageCount,
      trashedAt: h.trashedAt ?? "",
      unverified: h.unverified,
    });
  }

  const collapsed = collapseGroupConversations(
    groupYearRowsToCollapseThreads(input.groupChats),
  );
  const trashedAtByConv = new Map<number, string>();
  for (const row of input.groupChats) {
    if (!row.trashedAt) continue;
    const prev = trashedAtByConv.get(row.id);
    if (!prev || row.trashedAt > prev) trashedAtByConv.set(row.id, row.trashedAt);
  }
  for (const g of collapsed) {
    items.push({
      key: `g:${g.conversationId}`,
      category: "groupMessages",
      conversationId: g.conversationId,
      displayName: g.namedTitle?.trim() || g.title || "Group message",
      messageCount: g.messageCount,
      trashedAt: trashedAtByConv.get(g.conversationId) ?? "",
      group: g,
    });
  }

  return items;
}

export function groupTrashListByCategory(
  items: TrashListItem[],
): Array<[TrashCategory, TrashListItem[]]> {
  const buckets: Record<TrashCategory, TrashListItem[]> = {
    messages: [],
    groupMessages: [],
  };
  for (const item of items) {
    buckets[item.category].push(item);
  }
  for (const cat of TRASH_CATEGORY_ORDER) {
    buckets[cat].sort((a, b) => {
      const byDate = byTrashedAtDesc(a.trashedAt, b.trashedAt);
      if (byDate !== 0) return byDate;
      return a.displayName.localeCompare(b.displayName, undefined, {
        sensitivity: "base",
      });
    });
  }
  return TRASH_CATEGORY_ORDER.filter((cat) => buckets[cat].length > 0).map(
    (cat) => [cat, buckets[cat]] as [TrashCategory, TrashListItem[]],
  );
}

export function filterTrashListItems(
  items: TrashListItem[],
  query: string,
): TrashListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const hay = [item.displayName, item.key];
    if (item.category === "messages") {
      hay.push(item.handle);
    }
    return hay.join("\0").toLowerCase().includes(q);
  });
}
