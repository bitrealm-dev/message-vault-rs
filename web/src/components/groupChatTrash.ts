import type { HistoryCommand } from "./history/historyTypes";

type TrashStatusMessages = {
  trashedOne: string;
  trashedMany: (n: number) => string;
  restoredOne: string;
  restoredMany: (n: number) => string;
  deletedOne: string;
  deletedMany: (n: number) => string;
};

const DEFAULT_STATUS: TrashStatusMessages = {
  trashedOne: "Moved to Trash",
  trashedMany: (n) => `Moved ${n} to Trash`,
  restoredOne: "Undeleted — back in Group Messages",
  restoredMany: (n) => `Undeleted ${n} group messages`,
  deletedOne: "Deleted forever",
  deletedMany: (n) => `Deleted ${n} group messages forever`,
};

const BROWSE_STATUS: TrashStatusMessages = {
  trashedOne: "Moved group message to Trash",
  trashedMany: (n) => `Moved ${n} group messages to Trash`,
  restoredOne: "",
  restoredMany: () => "",
  deletedOne: "",
  deletedMany: () => "",
};

export function groupChatTrashHistoryEntry(
  ids: number[],
): Extract<HistoryCommand, { type: "trashGroupThread" }> {
  return {
    type: "trashGroupThread",
    conversationIds: ids,
    label:
      ids.length === 1
        ? "Delete group message"
        : `Delete ${ids.length} group messages`,
  };
}

/**
 * Shared useTrashActions option pieces for group-chat trash across shells.
 * Shells still supply getTargets, canTrash, onRemoved, setStatus, etc.
 */
export function createGroupChatTrashOptions(options?: {
  /** Group year-row shells: enables multi-year confirm wording. */
  conversationSpansMultipleYears?: (id: number) => boolean;
  /** Browse uses shorter confirm copy and browse-specific status strings. */
  variant?: "default" | "browse";
}): {
  endpoint: string;
  idField: string;
  confirmTrash: (targets: number[]) => string;
  confirmPermanent: (targets: number[]) => string;
  status: TrashStatusMessages;
  historyEntry: (ids: number[]) => Extract<
    HistoryCommand,
    { type: "trashGroupThread" }
  >;
} {
  const variant = options?.variant ?? "default";
  const spansMultipleYears = options?.conversationSpansMultipleYears;

  return {
    endpoint: "/api/group-chats/trash",
    idField: "conversationId",
    confirmTrash: (targets) => {
      if (variant === "browse") {
        if (targets.length === 1) {
          return "Move this group message to Trash?";
        }
        return `Move ${targets.length} group messages to Trash?`;
      }
      const multiYear =
        targets.length === 1 &&
        spansMultipleYears?.(targets[0]!) === true;
      if (targets.length === 1) {
        return multiYear
          ? "Move this group message to Trash? It appears under multiple years and will be removed from all of them."
          : "Move this group message to Trash?";
      }
      return `Move ${targets.length} group messages to Trash? Each chat will be removed from every year it appears under.`;
    },
    confirmPermanent: (targets) => {
      if (targets.length === 1) return "Delete forever?";
      return `Delete ${targets.length} group messages forever?`;
    },
    status: variant === "browse" ? BROWSE_STATUS : DEFAULT_STATUS,
    historyEntry: groupChatTrashHistoryEntry,
  };
}
