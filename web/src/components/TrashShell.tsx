"use client";

import type {
  GroupYearRow,
  TrashedContactItem,
  TrashedContactMessagesItem,
  UnassignedHandle,
} from "@/lib/types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GroupChatsShell } from "./GroupChatsShell";
import { useHistory } from "./history";
import { ChevronDownIcon } from "./icons";
import {
  TrashListChrome,
  type TrashChromeController,
} from "./TrashListChrome";
import { UnassignedShell } from "./UnassignedShell";
import { useDismissible } from "./useDismissible";

type TrashTab = "contacts" | "group-chats";

function chromeDataEqual(
  a: TrashChromeController,
  b: TrashChromeController,
): boolean {
  return (
    a.selectAllRef === b.selectAllRef &&
    a.allSelected === b.allSelected &&
    a.selectedCount === b.selectedCount &&
    a.itemCount === b.itemCount &&
    a.query === b.query &&
    a.saving === b.saving &&
    a.canDeleteForever === b.canDeleteForever &&
    a.selectAllLabel === b.selectAllLabel &&
    a.sort?.sortBy === b.sort?.sortBy &&
    a.sort?.order === b.sort?.order &&
    a.sort?.kind === b.sort?.kind
  );
}

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

function TrashMoreMenu({
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useDismissible({
    open,
    onDismiss: () => setOpen(false),
    refs: [rootRef],
  });

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0 items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] leading-none transition-colors ${
          open
            ? "bg-accent/20 text-accent"
            : "bg-elevated text-muted hover:text-text"
        }`}
      >
        More
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 z-50 mt-1 min-w-[11rem] rounded-lg border border-border bg-[#2c2c2e] py-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] hover:bg-white/20 ${
              tab === "contacts" ? "text-accent" : "text-text"
            }`}
            onClick={() => {
              setOpen(false);
              onSwitch("contacts");
            }}
          >
            <span>Contacts</span>
            <span className="text-muted tabular-nums">{contactCount}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] hover:bg-white/20 ${
              tab === "group-chats" ? "text-accent" : "text-text"
            }`}
            onClick={() => {
              setOpen(false);
              onSwitch("group-chats");
            }}
          >
            <span>Group chats</span>
            <span className="text-muted tabular-nums">{groupCount}</span>
          </button>
        </div>
      )}
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
  const chromeRef = useRef<TrashChromeController | null>(null);
  const [chrome, setChrome] = useState<TrashChromeController | null>(null);

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
    <TrashMoreMenu
      tab={tab}
      contactCount={contactList.length}
      groupCount={groupCount}
      onSwitch={switchTab}
    />
  );

  const onTrashChrome = useCallback((next: TrashChromeController | null) => {
    chromeRef.current = next;
    setChrome((prev) => {
      if (next === null) return null;
      if (prev && chromeDataEqual(prev, next)) return prev;
      return next;
    });
  }, []);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-sidebar">
      {chrome ? (
        <TrashListChrome
          selectAllRef={chrome.selectAllRef}
          allSelected={chrome.allSelected}
          selectedCount={chrome.selectedCount}
          itemCount={chrome.itemCount}
          query={chrome.query}
          saving={chrome.saving}
          canDeleteForever={chrome.canDeleteForever}
          selectAllLabel={chrome.selectAllLabel}
          sort={
            chrome.sort
              ? {
                  kind: chrome.sort.kind,
                  sortBy: chrome.sort.sortBy,
                  order: chrome.sort.order,
                  onChange: (next) => chromeRef.current?.sort?.onChange(next),
                }
              : undefined
          }
          onQueryChange={(q) => chromeRef.current?.onQueryChange(q)}
          onToggleSelectAll={() => chromeRef.current?.onToggleSelectAll()}
          onDeleteForever={() => chromeRef.current?.onDeleteForever()}
          tabBar={tabBar}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        {tab === "contacts" ? (
          <UnassignedShell
            mode="trash"
            handles={contactList}
            assignContacts={[]}
            initialHandle={initialHandle}
            hideListChrome
            onTrashChrome={onTrashChrome}
          />
        ) : (
          <GroupChatsShell
            mode="trash"
            groupChats={groupChats}
            initialConversationId={initialConversationId}
            initialYear={initialYear}
            embedded
            onTrashChrome={onTrashChrome}
          />
        )}
      </div>
    </div>
  );
}
