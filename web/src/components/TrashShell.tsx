"use client";

import type {
  ContactListItem,
  GroupYearRow,
  TrashedContactItem,
  TrashedContactMessagesItem,
  UnassignedHandle,
} from "@/lib/types";
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ContactsTrashShell } from "./ContactsTrashShell";
import { GroupChatsShell } from "./GroupChatsShell";
import { UnassignedShell } from "./UnassignedShell";

type TrashTab = "unassigned" | "group-chats" | "contacts";

export function TrashShell({
  handles,
  groupChats,
  trashedContacts,
  trashedContactMessages,
  assignContacts,
  initialHandle,
  initialConversationId,
  initialYear,
}: {
  handles: UnassignedHandle[];
  groupChats: GroupYearRow[];
  trashedContacts: TrashedContactItem[];
  trashedContactMessages: TrashedContactMessagesItem[];
  assignContacts: ContactListItem[];
  initialHandle: string | null;
  initialConversationId: number | null;
  initialYear: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab: TrashTab = (() => {
    const raw = searchParams.get("tab");
    if (raw === "group-chats") return "group-chats";
    if (raw === "contacts") return "contacts";
    return "unassigned";
  })();

  const switchTab = useCallback(
    (next: TrashTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "group-chats") {
        params.set("tab", "group-chats");
        params.delete("h");
        params.delete("c");
      } else if (next === "contacts") {
        params.set("tab", "contacts");
        params.delete("h");
        params.delete("g");
        params.delete("y");
      } else {
        params.delete("tab");
        params.delete("g");
        params.delete("y");
        params.delete("c");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const contactsCount = trashedContacts.length + trashedContactMessages.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-panel px-4 py-2">
        <button
          type="button"
          onClick={() => switchTab("unassigned")}
          className={`rounded-md px-3 py-1.5 text-[13px] ${
            tab === "unassigned"
              ? "bg-elevated text-text"
              : "text-muted hover:text-text"
          }`}
        >
          Unassigned
          <span className="ml-1.5 text-muted">{handles.length}</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab("contacts")}
          className={`rounded-md px-3 py-1.5 text-[13px] ${
            tab === "contacts"
              ? "bg-elevated text-text"
              : "text-muted hover:text-text"
          }`}
        >
          Contacts
          <span className="ml-1.5 text-muted">{contactsCount}</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab("group-chats")}
          className={`rounded-md px-3 py-1.5 text-[13px] ${
            tab === "group-chats"
              ? "bg-elevated text-text"
              : "text-muted hover:text-text"
          }`}
        >
          Group chats
          <span className="ml-1.5 text-muted">
            {new Set(groupChats.map((g) => g.id)).size}
          </span>
        </button>
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        {tab === "unassigned" ? (
          <UnassignedShell
            mode="trash"
            handles={handles}
            assignContacts={assignContacts}
            initialHandle={initialHandle}
          />
        ) : tab === "contacts" ? (
          <ContactsTrashShell
            contacts={trashedContacts}
            messagesOnly={trashedContactMessages}
          />
        ) : (
          <GroupChatsShell
            mode="trash"
            groupChats={groupChats}
            initialConversationId={initialConversationId}
            initialYear={initialYear}
          />
        )}
      </div>
    </div>
  );
}
