"use client";

import type { GroupChatThread, GroupParticipant } from "@/lib/types";
import {
  formatGroupDateTable,
  type GroupDateFormat,
} from "@/lib/groupDateFormat";
import type { MouseEvent, RefObject } from "react";
import { IconHoverTarget } from "./IconHoverLabel";
import { MessageIcon, PeopleCountIcon, TrashMessagesIcon } from "./icons";
import {
  BrowseGroupChatSortMenu,
  type BrowseGroupChatSortBy,
  type SortOrder,
} from "./SortByMenu";
import { YearFilterMenu } from "./YearFilterMenu";

export type ContactGroupConversation = {
  conversationId: number;
  conversationIds: number[];
  title: string;
  titleFull: string;
  namedTitle: string | null;
  participantCount: number;
  participantNames: string[];
  participantHandles: string[];
  participants: GroupParticipant[];
  messageCount: number;
  dateStart: string;
  dateEnd: string;
  newestYear: number;
};

/** Collapse year-bucketed contact group threads into one row per conversation. */
export function collapseContactGroupChats(
  rows: GroupChatThread[],
): ContactGroupConversation[] {
  const map = new Map<number, ContactGroupConversation>();
  for (const r of rows) {
    const ids =
      r.conversationIds?.length > 0 ? r.conversationIds : [r.conversationId];
    const primary = ids[0]!;
    const prev = map.get(primary);
    if (!prev) {
      map.set(primary, {
        conversationId: primary,
        conversationIds: [...ids],
        title: r.title,
        titleFull: r.titleFull,
        namedTitle: r.namedTitle,
        participantCount: r.participantCount,
        participantNames: [...(r.participantNames ?? [])],
        participantHandles: [...(r.participantHandles ?? [])],
        participants: [...(r.participants ?? [])],
        messageCount: r.messageCount,
        dateStart: r.dateStart,
        dateEnd: r.dateEnd,
        newestYear: r.year,
      });
      continue;
    }
    prev.messageCount += r.messageCount;
    if (r.year > prev.newestYear) prev.newestYear = r.year;
    if (r.dateStart < prev.dateStart) prev.dateStart = r.dateStart;
    if (r.dateEnd > prev.dateEnd) prev.dateEnd = r.dateEnd;
    if (!prev.namedTitle && r.namedTitle) prev.namedTitle = r.namedTitle;
    for (const name of r.participantNames ?? []) {
      if (!prev.participantNames.includes(name)) prev.participantNames.push(name);
    }
    for (const handle of r.participantHandles ?? []) {
      if (!prev.participantHandles.includes(handle)) {
        prev.participantHandles.push(handle);
      }
    }
    for (const p of r.participants ?? []) {
      if (!prev.participants.some((x) => x.handle === p.handle)) {
        prev.participants.push(p);
      }
    }
    for (const id of ids) {
      if (!prev.conversationIds.includes(id)) prev.conversationIds.push(id);
    }
  }
  return [...map.values()];
}

function formatRange(
  start: string,
  end: string,
  style: GroupDateFormat,
): string {
  const a = formatGroupDateTable(start, style);
  if (end === start) return a;
  return `${a} – ${formatGroupDateTable(end, style)}`;
}

const NAME_SEP = "  ·  ";
const MAX_VISIBLE_NAMES = 8;

/** Soft wrap gap around · so whole names stay together. */
function NameSep() {
  return (
    <span className="font-normal text-muted" aria-hidden>
      {" · "}
    </span>
  );
}

/** Show up to 8 names; 9+ adds +n for the remainder. */
function visibleParticipantLabels(labels: string[]): string[] {
  if (labels.length <= MAX_VISIBLE_NAMES) return labels;
  return [
    ...labels.slice(0, MAX_VISIBLE_NAMES),
    `+${labels.length - MAX_VISIBLE_NAMES}`,
  ];
}

function rowPeopleNames(g: ContactGroupConversation): string[] {
  if (g.participantNames.length > 0) return g.participantNames;
  if (g.title && g.title !== "Group chat" && g.title !== "Group message") {
    return g.title
      .split(/\u00a0*\u00a0·\u00a0\u00a0| {2}· {2}/)
      .map((n) => n.replace(/\u00a0/g, " ").trim())
      .filter(Boolean);
  }
  return [];
}

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
  items: ContactGroupConversation[];
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
            const dateLabel = formatRange(
              g.dateStart,
              g.dateEnd,
              groupDateFormat,
            );
            const allNames = rowPeopleNames(g);
            const names = visibleParticipantLabels(allNames);
            const namesTitle =
              allNames.length > 0 ? allNames.join(NAME_SEP) : g.titleFull;
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
                  <span className="min-w-0 flex-1">
                    {g.namedTitle ? (
                      <span className="mb-0.5 block truncate text-[12px] font-medium text-text">
                        {g.namedTitle}
                      </span>
                    ) : null}
                    {names.length > 0 ? (
                      <span
                        className="line-clamp-3 text-[13px] font-medium leading-snug text-text"
                        title={namesTitle}
                      >
                        {names.map((name, idx) => (
                          <span key={`${g.conversationId}-name-${idx}`}>
                            {idx > 0 ? <NameSep /> : null}
                            <span className="whitespace-nowrap">{name}</span>
                          </span>
                        ))}
                      </span>
                    ) : !g.namedTitle ? (
                      <span className="line-clamp-3 text-[13px] font-medium leading-snug text-text">
                        {g.title}
                      </span>
                    ) : null}
                    <span className="mt-0.5 block text-[11px] text-muted tabular-nums">
                      {dateLabel}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end justify-between gap-1 self-stretch py-0.5 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-0.5 tabular-nums">
                      <MessageIcon className="size-3.5 shrink-0 opacity-80" />
                      {g.messageCount.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-0.5 tabular-nums">
                      <PeopleCountIcon className="size-3.5 shrink-0 opacity-80" />
                      {g.participantCount.toLocaleString()}
                    </span>
                  </span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
