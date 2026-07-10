export type ContactSection = "people" | "historical" | "girls";

export type ContactListItem = {
  id: number;
  displayName: string;
  preferredPhone: string | null;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  sortFirst: string;
  sortLast: string;
  letter: string;
};

export type ContactDetail = ContactListItem & {
  middleName: string | null;
  email: string | null;
  hidden: boolean;
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
  messageCount: number;
  dateStart: string | null;
  dateEnd: string | null;
};

export type AttachmentRow = {
  id: number;
  mimeType: string | null;
  originalName: string | null;
  assetsPath: string | null;
  sha256: string | null;
};

export type MessageRow = {
  id: number;
  timestamp: string;
  isFromMe: boolean;
  sender: string | null;
  senderName: string;
  body: string | null;
  isAnnouncement: boolean;
  attachments: AttachmentRow[];
};

export type HomeStats = {
  people: number;
  historical: number;
  girls: number;
  groups: number;
  messages: number;
  contacts: number;
};
