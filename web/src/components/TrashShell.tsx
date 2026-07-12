"use client";

import type { ContactListItem, GroupYearRow, UnassignedHandle } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GroupChatsShell } from "./GroupChatsShell";
import { UnassignedShell } from "./UnassignedShell";

type TrashTab = "unassigned" | "group-chats";

export function TrashShell({
  handles,
  groupChats,
  assignContacts,
  initialHandle,
  initialConversationId,
  initialYear,
  initialTab,
}: {
  handles: UnassignedHandle[];
  groupChats: GroupYearRow[];
  assignContacts: ContactListItem[];
  initialHandle: string | null;
  initialConversationId: number | null;
  initialYear: number | null;
  initialTab: TrashTab;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TrashTab>(initialTab);

  const switchTab = useCallback(
    (next: TrashTab) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "group-chats") {
        params.set("tab", "group-chats");
        params.delete("h");
      } else {
        params.delete("tab");
        params.delete("g");
        params.delete("y");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Keep tab in sync when landing via ?tab=group-chats (e.g. after Delete).
  useEffect(() => {
    const next: TrashTab =
      searchParams.get("tab") === "group-chats" ? "group-chats" : "unassigned";
    setTab(next);
  }, [searchParams]);

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
