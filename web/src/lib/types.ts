export type ContactSection =
  | "contacts"
  | "all"
  | "excluded"
  | "no-messages"
  | "no-group"
  | { group: string };

export type ContactListItem = {
  id: number;
  displayName: string;
  preferredHandle: string | null;
  firstName: string | null;
  lastName: string | null;
  sortFirst: string;
  sortLast: string;
  letter: string;
  contactGroups: string[];
  exclude: boolean;
  /** Soft-deduped 1:1 message total (Combined view). */
  messageCount: number;
};

export type ContactDetail = ContactListItem & {
  phones: string[];
  dateStart: string | null;
  dateEnd: string | null;
};

export type YearThread = {
  year: number;
  messageCount: number;
  dateStart: string;
  dateEnd: string;
  conversationIds: number[];
};

export type GroupChatThread = {
  conversationId: number;
  conversationIds: number[];
  title: string;
  titleFull: string;
  namedTitle: string | null;
  participantCount: number;
  year: number;
  messageCount: number;
  dateStart: string;
  dateEnd: string;
};

/** One group conversation bucketed into a calendar year for the Groups page. */
export type GroupYearRow = {
  id: number;
  year: number;
  title: string;
  titleFull: string;
  namedTitle: string | null;
  participantCount: number;
  participantNames: string[];
  participantHandles: string[];
  /** Messages in this year only. */
  messageCount: number;
  dateStart: string;
  dateEnd: string;
  /** Full conversation range (all years). */
  conversationDateStart: string;
  conversationDateEnd: string;
  spansMultipleYears: boolean;
};

export type AttachmentRow = {
  id: number;
  mimeType: string | null;
  originalName: string | null;
  assetsPath: string | null;
  sha256: string | null;
  derivedMimeType: string | null;
  derivedAssetsPath: string | null;
  derivedSha256: string | null;
};

export type MessageRow = {
  id: number;
  source: string;
  timestamp: string;
  isFromMe: boolean;
  sender: string | null;
  senderName: string;
  body: string | null;
  isAnnouncement: boolean;
  attachments: AttachmentRow[];
};

export type UnassignedHandle = {
  handle: string;
  displayName: string;
  nameHint: string | null;
  messageCount: number;
  dateStart: string | null;
  dateEnd: string | null;
  sortKey: string;
  letter: string;
};

/** Soft-trashed contact (contact + 1:1 messages). */
export type TrashedContactItem = {
  kind: "contact";
  contactId: number;
  displayName: string;
  preferredHandle: string | null;
  handleCount: number;
  messageCount: number;
  sortKey: string;
  letter: string;
};

/** Soft-trashed 1:1 handle still linked to a live contact. */
export type TrashedContactMessagesItem = {
  kind: "messages_only";
  contactId: number;
  handle: string;
  displayName: string;
  messageCount: number;
  sortKey: string;
  letter: string;
};

export type HomeStats = {
  /** Non-excluded contacts with messages (`/contacts`). */
  included: number;
  /** All contacts with messages, including excluded (`/all`). */
  all: number;
  excluded: number;
  noMessages: number;
  unassigned: number;
  groupChats: number;
  /** Soft-deduped messages (`duplicate_of IS NULL`). */
  messages: number;
  /** Cross-source copies marked as duplicates. */
  messageDuplicates: number;
  /** Total contact rows in the DB. */
  contacts: number;
};
