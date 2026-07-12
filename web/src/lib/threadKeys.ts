/** Stable key for a 1:1 year bucket in the contact browse thread list. */
export function yearThreadKey(year: number): string {
  return `y-${year}`;
}

/**
 * Stable key for a group-chat year row. Prefers merged conversationIds when
 * several source conversations were combined into one UI row.
 */
export function groupThreadKey(thread: {
  conversationId: number;
  conversationIds?: number[] | null;
  year: number;
}): string {
  const ids =
    thread.conversationIds && thread.conversationIds.length > 0
      ? thread.conversationIds
      : [thread.conversationId];
  return `g-${ids.join("-")}-${thread.year}`;
}

/** Match canonical merged key or single-id form used before merges. */
export function isGroupChatThreadKey(
  thread: {
    conversationId: number;
    conversationIds?: number[] | null;
    year: number;
  },
  key: string,
): boolean {
  return (
    groupThreadKey(thread) === key ||
    `g-${thread.conversationId}-${thread.year}` === key
  );
}
