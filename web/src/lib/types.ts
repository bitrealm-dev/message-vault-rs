export type ContactSection =
  | "all"
  | "excluded"
  | "no-messages"
  | "untagged"
  | { tag: string };

export type ContactListItem = {
  id: number;
  displayName: string;
  preferredPhone: string | null;
  firstName: string | null;
  lastName: string | null;
  sortFirst: string;
  sortLast: string;
  letter: string;
  tags: string[];
  exclude: boolean;
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

export type GroupThread = {
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

export type GroupListItem = {
  id: number;
  title: string;
  titleFull: string;
  namedTitle: string | null;
  participantCount: number;
  participantNames: string[];
  participantHandles: string[];
  messageCount: number;
  dateStart: string | null;
  dateEnd: string | null;
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

export type UnmatchedHandle = {
  handle: string;
  displayName: string;
  nameHint: string | null;
  messageCount: number;
  dateStart: string | null;
  dateEnd: string | null;
  sortKey: string;
  letter: string;
};

export type HomeStats = {
  all: number;
  excluded: number;
  noMessages: number;
  unmatched: number;
  groups: number;
  messages: number;
  contacts: number;
};
