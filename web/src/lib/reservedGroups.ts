/**
 * Names that must not appear as user-created groups, and are filtered
 * from the groups list (nav / section labels).
 */
export const RESERVED_GROUP_NAMES = new Set(
  [
    "home",
    "all",
    "excluded",
    "no-messages",
    "no messages",
    "unassigned",
    "trash",
    "groups",
    "group-chats",
    "group chats",
    "no-group",
    "no group",
  ].map((s) => s.toLowerCase()),
);

export function isReservedGroupName(name: string): boolean {
  return RESERVED_GROUP_NAMES.has(name.trim().toLowerCase());
}

export function reservedGroupError(name: string): string {
  const key = name.trim().toLowerCase();
  if (key === "excluded") return "Excluded is a reserved group";
  if (key === "unassigned") return "Unassigned is a reserved group";
  if (key === "trash") return "Trash is a reserved group";
  if (key === "no messages" || key === "no-messages") {
    return "No messages is a reserved group";
  }
  if (key === "group chats" || key === "group-chats" || key === "groups") {
    return "Group chats is a reserved name";
  }
  return `"${name.trim()}" is a reserved group`;
}
