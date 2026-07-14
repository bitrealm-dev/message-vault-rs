/** Serializable undo/redo commands (no closures). */

export const HISTORY_MAX_DEPTH = 20;
export const HISTORY_TOAST_MS = 10_000;

export type TrashContactMode = "contact_and_messages" | "messages_only";

export type HistoryCommand =
  | {
      type: "assignHandles";
      contactId: number;
      handles: string[];
      label: string;
    }
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
    }
  | {
      type: "trashUnassignedHandles";
      handles: string[];
      label: string;
    };

export type HistoryToast = {
  text: string;
};
