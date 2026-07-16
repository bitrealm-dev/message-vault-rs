"use client";

import type { CollapsedGroupConversation } from "@/lib/groupChatList";
import type { GroupDateFormat } from "@/lib/groupDateFormat";
import type { MouseEvent, RefObject } from "react";
import { GroupConversationRowBody } from "./GroupConversationRow";
import { IconHoverTarget } from "./IconHoverLabel";
import { TrashMessagesIcon } from "./icons";
import {
  BrowseGroupChatSortMenu,
  type BrowseGroupChatSortBy,
  type SortOrder,
} from "./SortByMenu";
import { YearFilterMenu } from "./YearFilterMenu";

export function BrowseGroupChatsPane({
  items,
  selectedConversationId,
  selectedIds,
  selectAllRef,
  allSelected,
  onToggleSelectAll,
  onSelectColumnClick,
  onRowClick,
  onTrashMessages,
  trashDisabled = false,
  vaultReadOnly = false,
  years,
  filterYear,
  onFilterYearChange,
  sortBy,
  sortOrder,
  onSortChange,
  searchQuery,
  onSearchQueryChange,
  searchDisabled = false,
  groupDateFormat,
  emptyLabel = "No group messages",
}: {
  items: CollapsedGroupConversation[];
  selectedConversationId: number | null;
  selectedIds: Set<number>;
  selectAllRef: RefObject<HTMLInputElement | null>;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onSelectColumnClick: (id: number, e: MouseEvent) => void;
  onRowClick: (
    id: number,
    e: MouseEvent | { shiftKey: boolean; metaKey?: boolean; ctrlKey?: boolean },
  ) => void;
  onTrashMessages?: () => void;
  trashDisabled?: boolean;
  vaultReadOnly?: boolean;
  years: number[];
  filterYear: number | null;
  onFilterYearChange: (year: number | null) => void;
  sortBy: BrowseGroupChatSortBy;
  sortOrder: SortOrder;
  onSortChange: (next: {
    sortBy: BrowseGroupChatSortBy;
    order: SortOrder;
  }) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchDisabled?: boolean;
  groupDateFormat: GroupDateFormat;
  emptyLabel?: string;
}) {
  const selectionActive = selectedIds.size >= 1;

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">
      <div className="flex h-[45px] shrink-0 items-center border-b border-border px-3">
        <input
          type="search"
          value={searchQuery}
          disabled={searchDisabled}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search groups for name or phone…"
          className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>
      <div className="flex h-[45px] shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <label className="flex min-w-0 items-center gap-2">
          <IconHoverTarget label="Select all" placement="bottom">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              disabled={items.length === 0}
              aria-label="Select all group messages"
              onChange={onToggleSelectAll}
              className="checkbox-list"
            />
          </IconHoverTarget>
          <span className="truncate text-[13px] text-muted tabular-nums">
            {selectedIds.size > 0 ? selectedIds.size : ""}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          {!vaultReadOnly && onTrashMessages && (
            <IconHoverTarget label="Delete group messages" placement="bottom">
              <button
                type="button"
                aria-label="Delete group messages"
                disabled={trashDisabled}
                onClick={onTrashMessages}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-elevated text-muted hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <TrashMessagesIcon className="size-4" />
              </button>
            </IconHoverTarget>
          )}
          <YearFilterMenu
            years={years}
            value={filterYear}
            onChange={onFilterYearChange}
          />
          <BrowseGroupChatSortMenu
            sortBy={sortBy}
            order={sortOrder}
            onChange={onSortChange}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="sticky top-0 z-10 border-b border-border bg-sidebar px-3 py-1 text-[11px] font-semibold text-muted">
          Group messages
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-muted">{emptyLabel}</p>
        ) : (
          items.map((g, i) => {
            const active = g.conversationId === selectedConversationId;
            const checked = selectedIds.has(g.conversationId);
            return (
              <div
                key={g.conversationId}
                role={selectionActive ? "button" : undefined}
                tabIndex={selectionActive ? 0 : undefined}
                title={g.titleFull}
                onClick={
                  selectionActive
                    ? (e) => onRowClick(g.conversationId, e)
                    : undefined
                }
                onKeyDown={
                  selectionActive
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(g.conversationId, {
                            shiftKey: e.shiftKey,
                            metaKey: e.metaKey,
                            ctrlKey: e.ctrlKey,
                          });
                        }
                      }
                    : undefined
                }
                onMouseDown={(e) => {
                  if (e.shiftKey) e.preventDefault();
                }}
                className={`group relative flex w-full items-start gap-1.5 py-2.5 pr-3 pl-0 text-left select-none ${
                  selectionActive ? "cursor-pointer" : ""
                } ${
                  checked
                    ? "bg-accent/40 hover:bg-accent/50"
                    : active
                      ? "bg-accent/20 hover:bg-accent/25"
                      : "hover:bg-white/20"
                } ${i < items.length - 1 ? "border-b border-border/40" : ""}`}
              >
                {active && !checked && (
                  <span
                    aria-hidden
                    className="absolute top-1 bottom-1 left-0 w-1 rounded-full bg-accent/80"
                  />
                )}
                {checked && (
                  <span
                    aria-hidden
                    className="absolute top-1 bottom-1 left-0 w-1 rounded-full bg-accent"
                  />
                )}
                <button
                  type="button"
                  aria-pressed={checked}
                  aria-label={`Select ${g.namedTitle || g.title || "group message"}`}
                  onClick={(e) => onSelectColumnClick(g.conversationId, e)}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) e.preventDefault();
                  }}
                  className="flex w-10 shrink-0 cursor-pointer items-center justify-center self-stretch -my-2.5"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    tabIndex={-1}
                    aria-hidden
                    className="checkbox-list pointer-events-none"
                  />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRowClick(g.conversationId, e);
                  }}
                  onMouseDown={(e) => {
                    if (e.shiftKey) e.preventDefault();
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  <GroupConversationRowBody
                    conversation={g}
                    groupDateFormat={groupDateFormat}
                    variant="browse"
                  />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
