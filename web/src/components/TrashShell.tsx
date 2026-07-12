"use client";

import type { ContactListItem, GroupYearRow, UnassignedHandle } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GroupsShell } from "./GroupsShell";
import { UnassignedShell } from "./UnassignedShell";

type TrashTab = "individuals" | "groups";

export function TrashShell({
  handles,
  groups,
  assignContacts,
  initialHandle,
  initialGroupId,
  initialYear,
  initialTab,
}: {
  handles: UnassignedHandle[];
  groups: GroupYearRow[];
  assignContacts: ContactListItem[];
  initialHandle: string | null;
  initialGroupId: number | null;
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
      if (next === "groups") {
        params.set("tab", "groups");
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

  // Keep tab in sync when landing via ?tab=groups (e.g. after Delete).
  useEffect(() => {
    const next: TrashTab =
      searchParams.get("tab") === "groups" ? "groups" : "individuals";
    setTab(next);
  }, [searchParams]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-panel px-4 py-2">
        <button
          type="button"
          onClick={() => switchTab("individuals")}
          className={`rounded-md px-3 py-1.5 text-[13px] ${
            tab === "individuals"
              ? "bg-elevated text-text"
              : "text-muted hover:text-text"
          }`}
        >
          Individuals
          <span className="ml-1.5 text-muted">{handles.length}</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab("groups")}
          className={`rounded-md px-3 py-1.5 text-[13px] ${
            tab === "groups"
              ? "bg-elevated text-text"
              : "text-muted hover:text-text"
          }`}
        >
          Groups
          <span className="ml-1.5 text-muted">
            {new Set(groups.map((g) => g.id)).size}
          </span>
        </button>
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        {tab === "individuals" ? (
          <UnassignedShell
            mode="trash"
            handles={handles}
            assignContacts={assignContacts}
            initialHandle={initialHandle}
          />
        ) : (
          <GroupsShell
            mode="trash"
            groups={groups}
            initialGroupId={initialGroupId}
            initialYear={initialYear}
          />
        )}
      </div>
    </div>
  );
}
