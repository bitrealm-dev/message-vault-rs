"use client";

import type {
  GroupYearRow,
  TrashedContactItem,
  TrashedContactMessagesItem,
  UnassignedHandle,
} from "@/lib/types";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GroupChatsShell } from "./GroupChatsShell";
import { useHistory } from "./history";
import { UnassignedShell } from "./UnassignedShell";

type TrashTab = "contacts" | "group-chats";

function mergeTrashContactList(
  unassigned: UnassignedHandle[],
  contacts: TrashedContactItem[],
  messagesOnly: TrashedContactMessagesItem[],
): UnassignedHandle[] {
  const rows: UnassignedHandle[] = [];

  for (const h of unassigned) {
    const nameKey = h.nameHint?.trim() || h.handle;
    rows.push({
      ...h,
      trashKind: "unassigned",
      sortFirst: nameKey,
      sortLast: nameKey,
      firstName: null,
      lastName: null,
    });
  }

  for (const m of messagesOnly) {
    rows.push({
      handle: m.handle,
      displayName: m.displayName,
      nameHint: null,
      unverified: false,
      messageCount: m.messageCount,
      dateStart: null,
      dateEnd: null,
      sortKey: m.sortKey,
      letter: m.letter,
      trashKind: "messages_only",
      contactId: m.contactId,
      sortFirst: m.sortFirst,
      sortLast: m.sortLast,
      firstName: m.firstName,
      lastName: m.lastName,
    });
  }

  for (const c of contacts) {
    const handle = c.preferredHandle;
    if (!handle) continue;
    rows.push({
      handle,
      displayName: c.displayName,
      nameHint: null,
      unverified: false,
      messageCount: c.messageCount,
      dateStart: null,
      dateEnd: null,
      sortKey: c.sortKey,
      letter: c.letter,
      trashKind: "contact",
      contactId: c.contactId,
      sortFirst: c.sortFirst,
      sortLast: c.sortLast,
      firstName: c.firstName,
      lastName: c.lastName,
    });
  }

  return rows.sort((a, b) =>
    a.sortKey.localeCompare(b.sortKey, undefined, { sensitivity: "base" }),
  );
}

function TrashTabBar({
  tab,
  contactCount,
  groupCount,
  onSwitch,
}: {
  tab: TrashTab;
  contactCount: number;
  groupCount: number;
  onSwitch: (next: TrashTab) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => onSwitch("contacts")}
        className={`rounded-md px-2.5 py-1 text-[12px] leading-none ${
          tab === "contacts"
            ? "bg-elevated text-text"
            : "text-muted hover:text-text"
        }`}
      >
        Contacts
        <span className="ml-1 text-muted">{contactCount}</span>
      </button>
      <button
        type="button"
        onClick={() => onSwitch("group-chats")}
        className={`rounded-md px-2.5 py-1 text-[12px] leading-none ${
          tab === "group-chats"
            ? "bg-elevated text-text"
            : "text-muted hover:text-text"
        }`}
      >
        Group chats
        <span className="ml-1 text-muted">{groupCount}</span>
      </button>
    </div>
  );
}

export function TrashShell({
  handles,
  groupChats,
  trashedContacts,
  trashedContactMessages,
  initialHandle,
  initialConversationId,
  initialYear,
}: {
  handles: UnassignedHandle[];
  groupChats: GroupYearRow[];
  trashedContacts: TrashedContactItem[];
  trashedContactMessages: TrashedContactMessagesItem[];
  initialHandle: string | null;
  initialConversationId: number | null;
  initialYear: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { clear: clearHistory } = useHistory();

  useEffect(() => {
    clearHistory();
  }, [clearHistory]);

  const tab: TrashTab = (() => {
    const raw = searchParams.get("tab");
    if (raw === "group-chats") return "group-chats";
    return "contacts";
  })();

  const switchTab = useCallback(
    (next: TrashTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "group-chats") {
        params.set("tab", "group-chats");
        params.delete("h");
        params.delete("c");
      } else {
        params.set("tab", "contacts");
        params.delete("g");
        params.delete("y");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const contactList = useMemo(
    () =>
      mergeTrashContactList(handles, trashedContacts, trashedContactMessages),
    [handles, trashedContacts, trashedContactMessages],
  );

  const groupCount = useMemo(
    () => new Set(groupChats.map((g) => g.id)).size,
    [groupChats],
  );

  const tabBar: ReactNode = (
    <TrashTabBar
      tab={tab}
      contactCount={contactList.length}
      groupCount={groupCount}
      onSwitch={switchTab}
    />
  );

  return (
    <div className="h-full min-h-0 min-w-0">
      {tab === "contacts" ? (
        <UnassignedShell
          mode="trash"
          handles={contactList}
          assignContacts={[]}
          initialHandle={initialHandle}
          trashTabBar={tabBar}
        />
      ) : (
        <GroupChatsShell
          mode="trash"
          groupChats={groupChats}
          initialConversationId={initialConversationId}
          initialYear={initialYear}
          trashTabBar={tabBar}
        />
      )}
    </div>
  );
}
