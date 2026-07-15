"use client";

import type { GroupChatThread } from "@/lib/types";
import {
  formatGroupDateTable,
  type GroupDateFormat,
} from "@/lib/groupDateFormat";
import { MessageIcon, PeopleCountIcon } from "./icons";
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

export function BrowseGroupChatsPane({
  items,
  selectedConversationId,
  years,
  filterYear,
  onFilterYearChange,
  sortBy,
  sortOrder,
  onSortChange,
  groupDateFormat,
  onSelect,
  emptyLabel = "No group chats",
}: {
  items: ContactGroupConversation[];
  selectedConversationId: number | null;
  years: number[];
  filterYear: number | null;
  onFilterYearChange: (year: number | null) => void;
  sortBy: BrowseGroupChatSortBy;
  sortOrder: SortOrder;
  onSortChange: (next: {
    sortBy: BrowseGroupChatSortBy;
    order: SortOrder;
  }) => void;
  groupDateFormat: GroupDateFormat;
  onSelect: (g: ContactGroupConversation) => void;
  emptyLabel?: string;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">
      <div className="flex h-[45px] shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="truncate text-[13px] font-semibold text-text">
          Group chats
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
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
        {items.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-muted">{emptyLabel}</p>
        ) : (
          items.map((g, i) => {
            const active = g.conversationId === selectedConversationId;
            const dateLabel = formatRange(
              g.dateStart,
              g.dateEnd,
              groupDateFormat,
            );
            return (
              <button
                key={g.conversationId}
                type="button"
                title={g.titleFull}
                onClick={() => onSelect(g)}
                className={`group relative flex w-full items-start gap-2 py-2.5 pr-3 pl-3 text-left select-none ${
                  active
                    ? "bg-elevated hover:bg-white/18"
                    : "hover:bg-white/20"
                } ${i < items.length - 1 ? "border-b border-border/40" : ""}`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-[#c8c8c8]"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[13px] font-medium leading-snug text-text">
                    {g.namedTitle || g.title}
                  </span>
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
            );
          })
        )}
      </div>
    </aside>
  );
}
