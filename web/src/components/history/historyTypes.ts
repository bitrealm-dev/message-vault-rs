/** Serializable undo/redo commands (no closures). */

export const HISTORY_MAX_DEPTH = 20;
export const HISTORY_TOAST_MS = 15_000;

export type TrashContactMode = "contact_and_messages" | "messages_only";

export type HistoryCommand =
  | {
      type: "trashContacts";
      contactIds: number[];
      mode: TrashContactMode;
      /** Display names for toast / undo label (same order as contactIds). */
      names: string[];
      /** Populated for messages_only so undo can restore handles. */
      handles?: string[];
      label: string;
    }
  | {
      type: "trashGroupThread";
      conversationIds: number[];
      /** Display titles for toast / undo label (same order as conversationIds). */
      titles: string[];
      label: string;
    }
  | {
      type: "createContact";
      contactId: number;
      name: string;
      label: string;
    }
  | {
      type: "createLabel";
      name: string;
      label: string;
    }
  | {
      type: "deleteLabel";
      name: string;
      memberContactIds: number[];
      label: string;
    };

export type HistoryToast = {
  text: string;
  /** When true, snackbar shows an Undo control (action toasts only). */
  showUndo: boolean;
};

function joinSubjects(subjects: string[], fallback: string): string {
  const cleaned = subjects.map((s) => s.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(", ") : fallback;
}

/** Past-tense snackbar copy for a just-pushed command. */
export function toastTextForCommand(cmd: HistoryCommand): string {
  switch (cmd.type) {
    case "createContact":
      return `Created new contact ${cmd.name.trim() || "contact"}`;
    case "createLabel":
      return `Created label ${cmd.name.trim() || "label"}`;
    case "deleteLabel":
      return `Deleted label ${cmd.name.trim() || "label"}`;
    case "trashContacts": {
      const names = joinSubjects(cmd.names, "contact");
      return cmd.contactIds.length === 1
        ? `Deleted contact ${names}`
        : `Deleted contacts ${names}`;
    }
    case "trashGroupThread": {
      const n = cmd.conversationIds.length;
      if (n === 1) {
        const title = joinSubjects(cmd.titles, "group message");
        return `Deleted group message ${title}`;
      }
      return `Deleted ${n} group messages`;
    }
  }
}

/** Snackbar after a successful undo (no nested Undo control). */
export function undoToastTextForCommand(cmd: HistoryCommand): string {
  return `Undid — ${toastTextForCommand(cmd)}`;
}

/** Snackbar after a successful redo (no nested Undo control). */
export function redoToastTextForCommand(cmd: HistoryCommand): string {
  return `Redid — ${toastTextForCommand(cmd)}`;
}

/** Undo/Redo menu tooltip for a command with named subjects. */
export function trashContactsLabel(names: string[]): string {
  const joined = joinSubjects(names, "contact");
  return names.length <= 1
    ? `Delete contact ${joined}`
    : `Delete contacts ${joined}`;
}

export function trashGroupThreadLabel(titles: string[]): string {
  if (titles.length <= 1) {
    const joined = joinSubjects(titles, "group message");
    return `Delete group message ${joined}`;
  }
  return `Delete ${titles.length} group messages`;
}
