"use client";

import type { ReactNode, RefObject } from "react";
import {
  GroupTrashSortMenu,
  TrashSortMenu,
  type GroupTrashSortBy,
  type SortOrder,
  type TrashSortBy,
} from "./SortByMenu";

/** Handlers + state the active trash tab reports to the shared chrome. */
export type TrashChromeController = {
  selectAllRef: RefObject<HTMLInputElement | null>;
  allSelected: boolean;
  selectedCount: number;
  itemCount: number;
  query: string;
  onQueryChange: (q: string) => void;
  saving: boolean;
  canDeleteForever: boolean;
  onToggleSelectAll: () => void;
  onDeleteForever: () => void;
  selectAllLabel?: string;
  sort?: {
    kind: "contacts" | "groups";
    sortBy: string;
    order: SortOrder;
    onChange: (next: { sortBy: string; order: SortOrder }) => void;
  };
};

/** Shared trash list toolbar + search (Contacts / Group chats tabs). */
export function TrashListChrome({
  tabBar,
  selectAllRef,
  allSelected,
  selectedCount,
  itemCount,
  query,
  onQueryChange,
  saving,
  canDeleteForever,
  onToggleSelectAll,
  onDeleteForever,
  selectAllLabel = "Select all trash",
  sort,
}: TrashChromeController & {
  tabBar?: ReactNode;
}) {
  return (
    <>
      <div className="flex h-[45px] shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3">
        <label className="flex min-w-0 items-center gap-2">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            disabled={itemCount === 0}
            aria-label={selectAllLabel}
            onChange={onToggleSelectAll}
            className="checkbox-list"
          />
          <span className="truncate text-[13px] text-muted tabular-nums">
            {selectedCount > 0 ? selectedCount : ""}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          {tabBar}
          <button
            type="button"
            disabled={saving || !canDeleteForever}
            onClick={onDeleteForever}
            className="inline-flex h-7 items-center rounded-md bg-elevated px-2.5 text-[12px] leading-none text-muted transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:pointer-events-none disabled:opacity-40"
          >
            Delete forever
          </button>
          {sort?.kind === "groups" ? (
            <GroupTrashSortMenu
              sortBy={sort.sortBy as GroupTrashSortBy}
              order={sort.order}
              onChange={(next) =>
                sort.onChange({ sortBy: next.sortBy, order: next.order })
              }
            />
          ) : sort ? (
            <TrashSortMenu
              sortBy={sort.sortBy as TrashSortBy}
              order={sort.order}
              onChange={(next) =>
                sort.onChange({ sortBy: next.sortBy, order: next.order })
              }
            />
          ) : null}
        </div>
      </div>
      <div className="flex h-[45px] shrink-0 items-center border-b border-border bg-sidebar px-3">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent"
        />
      </div>
    </>
  );
}
