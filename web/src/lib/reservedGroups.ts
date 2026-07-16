/**
 * Names that must not appear as user-created groups, and are filtered
 * from the groups list (nav / section labels).
 */
export const RESERVED_GROUP_NAMES = new Set(
  [
    "home",
    "contacts",
    "all",
    "excluded",
    "no-messages",
    "no messages",
    "unassigned",
    "trash",
    "groups",
    "group-chats",
    "group chats",
    "group-chats-2",
    "group chats 2",
    "group-messages",
    "group messages",
    "group-messages-2",
    "group messages 2",
    "no-group",
    "no group",
  ].map((s) => s.toLowerCase()),
);

export function isReservedGroupName(name: string): boolean {
  return RESERVED_GROUP_NAMES.has(name.trim().toLowerCase());
}

export function reservedGroupError(name: string): string {
  const key = name.trim().toLowerCase();
  if (key === "contacts") return "Active is a reserved group";
  if (key === "all") return "All is a reserved group";
  if (key === "excluded") return "Inactive is a reserved group";
  if (key === "unassigned") return "Unassigned is a reserved group";
  if (key === "trash") return "Trash is a reserved group";
  if (key === "no messages" || key === "no-messages") {
    return "No messages is a reserved group";
  }
  if (
    key === "group chats" ||
    key === "group-chats" ||
    key === "group messages" ||
    key === "group-messages" ||
    key === "groups"
  ) {
    return "Group messages is a reserved name";
  }
  if (
    key === "group chats 2" ||
    key === "group-chats-2" ||
    key === "group messages 2" ||
    key === "group-messages-2"
  ) {
    return "Group Messages 2 is a reserved name";
  }
  return `"${name.trim()}" is a reserved group`;
}
