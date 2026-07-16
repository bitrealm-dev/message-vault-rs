"use client";

import type { CollapsedGroupConversation } from "@/lib/groupChatList";
import type { ContactDetail, ContactListItem } from "@/lib/types";

export function browseSelectionSummaryFlags(options: {
  hasSelection: boolean;
  hasGroupSelection: boolean;
  activeThread: string | null;
  contactId: number | null;
  detail: ContactDetail | null;
  contacts: ContactListItem[];
}): {
  showContactsCard: boolean;
  showGroupsCard: boolean;
  showFocusContactCard: boolean;
  showThreadPane: boolean;
  focusedContact: {
    id: number;
    displayName: string;
    preferredHandle: string | null;
  } | null;
} {
  const {
    hasSelection,
    hasGroupSelection,
    activeThread,
    contactId,
    detail,
    contacts,
  } = options;

  const showContactsCard =
    hasSelection &&
    (hasGroupSelection || !(activeThread?.startsWith("gfull-")));
  const showGroupsCard = hasGroupSelection;
  const focusedContact =
    contactId != null
      ? detail?.id === contactId
        ? detail
        : (contacts.find((c) => c.id === contactId) ?? null)
      : null;
  const showFocusContactCard =
    hasGroupSelection && !hasSelection && focusedContact != null;
  const showThreadPane =
    !showGroupsCard &&
    !(hasSelection && !(activeThread?.startsWith("gfull-")));

  return {
    showContactsCard,
    showGroupsCard,
    showFocusContactCard,
    showThreadPane,
    focusedContact,
  };
}

export function BrowseSelectionSummary({
  showContactsCard,
  showGroupsCard,
  showFocusContactCard,
  selectedContactCount,
  selectedGroupCount,
  selectedContacts,
  selectedGroupRows,
  focusedContact,
  onClearContactSelection,
  onClearGroupSelection,
  onClearContactFocus,
  onSelectContact,
  onSelectGroup,
}: {
  showContactsCard: boolean;
  showGroupsCard: boolean;
  showFocusContactCard: boolean;
  selectedContactCount: number;
  selectedGroupCount: number;
  selectedContacts: ContactListItem[];
  selectedGroupRows: CollapsedGroupConversation[];
  focusedContact: {
    id: number;
    displayName: string;
    preferredHandle: string | null;
  } | null;
  onClearContactSelection: () => void;
  onClearGroupSelection: () => void;
  onClearContactFocus: () => void;
  onSelectContact: (id: number) => void;
  onSelectGroup: (g: CollapsedGroupConversation) => void;
}) {
  const groupRowLabel = (g: CollapsedGroupConversation) => {
    if (g.namedTitle?.trim()) return g.namedTitle.trim();
    if (g.participantNames.length > 0) {
      return g.participantNames.join(" · ");
    }
    return g.title || "Group message";
  };
  const groupRowDate = (g: CollapsedGroupConversation) =>
    g.dateStart === g.dateEnd
      ? g.dateStart
      : `${g.dateStart} – ${g.dateEnd}`;

  const contactsCard = (
    <div className="rounded-xl border border-border bg-[#2c2c2e] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
        <h2 className="text-[14px] font-semibold text-text">
          {selectedContactCount} contact
          {selectedContactCount === 1 ? "" : "s"} selected
        </h2>
        <button
          type="button"
          onClick={onClearContactSelection}
          className="inline-flex items-center rounded-md bg-white/12 px-2.5 py-1 text-[12px] text-text transition-colors hover:bg-white/18"
        >
          Clear selection
        </button>
      </div>
      <ul>
        {selectedContacts.map((c, i) => (
          <li
            key={c.id}
            className={`flex items-center justify-between gap-4 px-4 py-2.5 ${
              i < selectedContacts.length - 1
                ? "border-b border-border/60"
                : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectContact(c.id)}
              className="min-w-0 truncate text-left text-[13px] text-text hover:text-accent"
            >
              {c.displayName}
            </button>
            <span className="shrink-0 text-[13px] text-muted tabular-nums">
              {c.preferredHandle ?? ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  const focusContactCard =
    focusedContact != null ? (
      <div className="rounded-xl border border-border bg-[#2c2c2e] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
          <h2 className="text-[14px] font-semibold text-text">
            1 contact selected
          </h2>
          <button
            type="button"
            onClick={onClearContactFocus}
            className="inline-flex items-center rounded-md bg-white/12 px-2.5 py-1 text-[12px] text-text transition-colors hover:bg-white/18"
          >
            Clear selection
          </button>
        </div>
        <ul>
          <li className="flex items-center justify-between gap-4 px-4 py-2.5">
            <button
              type="button"
              onClick={() => onSelectContact(focusedContact.id)}
              className="min-w-0 truncate text-left text-[13px] text-text hover:text-accent"
            >
              {focusedContact.displayName}
            </button>
            <span className="shrink-0 text-[13px] text-muted tabular-nums">
              {focusedContact.preferredHandle ?? ""}
            </span>
          </li>
        </ul>
      </div>
    ) : null;

  const groupsCard = (
    <div className="rounded-xl border border-border bg-[#2c2c2e] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
        <h2 className="text-[14px] font-semibold text-text">
          {selectedGroupCount} group message
          {selectedGroupCount === 1 ? "" : "s"} selected
        </h2>
        <button
          type="button"
          onClick={onClearGroupSelection}
          className="inline-flex items-center rounded-md bg-white/12 px-2.5 py-1 text-[12px] text-text transition-colors hover:bg-white/18"
        >
          Clear selection
        </button>
      </div>
      <ul>
        {selectedGroupRows.map((g, i) => (
          <li
            key={g.conversationId}
            className={`flex items-center justify-between gap-4 px-4 py-2.5 ${
              i < selectedGroupRows.length - 1
                ? "border-b border-border/60"
                : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectGroup(g)}
              className="min-w-0 truncate text-left text-[13px] text-text hover:text-accent"
              title={g.titleFull}
            >
              {groupRowLabel(g)}
            </button>
            <span className="shrink-0 text-[13px] text-muted tabular-nums">
              {groupRowDate(g)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-bg px-5 pt-8 pb-5">
      {showGroupsCard ? groupsCard : null}
      {showContactsCard ? contactsCard : null}
      {showFocusContactCard ? focusContactCard : null}
    </div>
  );
}
