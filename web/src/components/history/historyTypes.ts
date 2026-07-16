/** Serializable undo/redo commands (no closures). */

export const HISTORY_MAX_DEPTH = 20;
export const HISTORY_TOAST_MS = 15_000;

export type TrashContactMode = "contact_and_messages" | "messages_only";

export type HistoryCommand =
  | {
      type: "trashContacts";
      contactIds: number[];
      mode: TrashContactMode;
      /** Populated for messages_only so undo can restore handles. */
      handles?: string[];
      label: string;
    }
  | {
      type: "trashGroupThread";
      conversationIds: number[];
      label: string;
    }
  | {
      type: "createContact";
      contactId: number;
      label: string;
    }
  | {
      type: "createGroup";
      name: string;
      label: string;
    }
  | {
      type: "deleteGroup";
      name: string;
      memberContactIds: number[];
      label: string;
    };

export type HistoryToast = {
  text: string;
  /** When true, snackbar shows an Undo control (action toasts only). */
  showUndo: boolean;
};

/** Past-tense snackbar copy for a just-pushed command. */
export function toastTextForCommand(cmd: HistoryCommand): string {
  switch (cmd.type) {
    case "createContact": {
      const name = cmd.label.replace(/^Create contact\s+/i, "").trim() || "contact";
      return `Created new contact "${name}"`;
    }
    case "createGroup":
      return `Created group "${cmd.name}"`;
    case "deleteGroup":
      return `Deleted group "${cmd.name}"`;
    case "trashContacts": {
      const n = cmd.contactIds.length;
      return n === 1
        ? "Deleted contact & messages"
        : `Deleted ${n} contacts & messages`;
    }
    case "trashGroupThread": {
      const n = cmd.conversationIds.length;
      return n === 1
        ? "Deleted group message"
        : `Deleted ${n} group messages`;
    }
  }
}
