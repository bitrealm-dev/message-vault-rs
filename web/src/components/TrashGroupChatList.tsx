"use client";

import type { GroupYearRow } from "@/lib/types";
import {
  formatGroupDateTable,
  type GroupDateFormat,
} from "@/lib/groupDateFormat";
import type { MouseEvent } from "react";
import { MessageIcon, PeopleCountIcon } from "./icons";

export type TrashGroupConversation = {
  id: number;
  newestYear: number;
  participantNames: string[];
  participantHandles: string[];
  participantCount: number;
  messageCount: number;
  conversationDateStart: string;
  conversationDateEnd: string;
  namedTitle: string | null;
  title: string;
};

const NAME_COLS = 4;
const NAME_ROWS = 3;
const NAME_SLOTS = NAME_COLS * NAME_ROWS;
const NAME_SEP = "  ·  ";

/** Collapse year-bucketed rows into one entry per conversation. */
export function collapseGroupConversations(
  rows: GroupYearRow[],
): TrashGroupConversation[] {
  const map = new Map<number, TrashGroupConversation>();
  for (const r of rows) {
    const prev = map.get(r.id);
    if (!prev) {
      map.set(r.id, {
        id: r.id,
        newestYear: r.year,
        participantNames: r.participantNames,
        participantHandles: r.participantHandles,
        participantCount: r.participantCount,
        messageCount: r.messageCount,
        conversationDateStart: r.conversationDateStart,
        conversationDateEnd: r.conversationDateEnd,
        namedTitle: r.namedTitle,
        title: r.title,
      });
      continue;
    }
    prev.messageCount += r.messageCount;
    if (r.year > prev.newestYear) prev.newestYear = r.year;
    if (prev.participantNames.length === 0 && r.participantNames.length > 0) {
      prev.participantNames = r.participantNames;
    }
    if (
      prev.participantHandles.length === 0 &&
      r.participantHandles.length > 0
    ) {
      prev.participantHandles = r.participantHandles;
    }
  }
  return [...map.values()];
}

function participantLabels(g: TrashGroupConversation): string[] {
  if (g.participantNames.length > 0) return g.participantNames;
  return g.participantHandles;
}

/**
 * Up to 3 lines of 4 names; last name becomes +n when overflowing.
 * Names on a line are joined with "  ·  ".
 */
export function nameLines(labels: string[]): string[] {
  const capped =
    labels.length <= NAME_SLOTS
      ? labels
      : [...labels.slice(0, NAME_SLOTS - 1), `+${labels.length - (NAME_SLOTS - 1)}`];
  const lines: string[] = [];
  for (let i = 0; i < capped.length; i += NAME_COLS) {
    lines.push(capped.slice(i, i + NAME_COLS).join(NAME_SEP));
  }
  return lines;
}

function formatConversationRange(
  start: string,
  end: string,
  style: GroupDateFormat,
): string {
  const a = formatGroupDateTable(start, style);
  if (end === start) return a;
  return `${a} – ${formatGroupDateTable(end, style)}`;
}

export function TrashGroupChatList({
  items,
  conversationId,
  selectedIds,
  query,
  groupDateFormat,
  onSelectColumnClick,
  onRowClick,
  onOpenCtxMenu,
}: {
  items: TrashGroupConversation[];
  conversationId: number | null;
  selectedIds: Set<number>;
  query: string;
  groupDateFormat: GroupDateFormat;
  onSelectColumnClick: (id: number, e: MouseEvent) => void;
  onRowClick: (g: TrashGroupConversation, e: MouseEvent) => void;
  onOpenCtxMenu: (id: number, x: number, y: number) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {items.length === 0 && (
          <p className="px-3 py-4 text-[12px] text-muted">
            {query.trim() ? "No matches" : "No trashed group chats"}
          </p>
        )}
        {items.map((g, i) => {
          const active = g.id === conversationId;
          const checked = selectedIds.has(g.id);
          const selectionActive = selectedIds.size >= 1;
          const showInsetDivider = i < items.length - 1;
          const lines = nameLines(participantLabels(g));
          const dateLabel = formatConversationRange(
            g.conversationDateStart,
            g.conversationDateEnd,
            groupDateFormat,
          );
          return (
            <div
              key={g.id}
              className={`group relative flex w-full items-start gap-1.5 py-2.5 pr-2 pl-0 select-none ${
                checked
                  ? "bg-accent/20 hover:bg-accent/25"
                  : active && !selectionActive
                    ? "bg-elevated hover:bg-white/18"
                    : "hover:bg-white/20"
              }`}
            >
              {active && !selectionActive && (
                <span
                  aria-hidden
                  className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-[#c8c8c8]"
                />
              )}
              {checked && (
                <span
                  aria-hidden
                  className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-accent"
                />
              )}
              <button
                type="button"
                aria-pressed={checked}
                aria-label={`Select group ${g.title}`}
                onClick={(e) => onSelectColumnClick(g.id, e)}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey) e.preventDefault();
                }}
                className="flex w-10 shrink-0 cursor-pointer items-center justify-center self-stretch -my-2.5 outline-none"
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
                onClick={(e) => onRowClick(g, e)}
                onMouseDown={(e) => {
                  if (e.shiftKey) e.preventDefault();
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenCtxMenu(g.id, e.clientX, e.clientY);
                }}
                className="min-w-0 flex-1 text-left outline-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {g.namedTitle ? (
                      <div className="mb-1 truncate text-[12px] font-medium text-text">
                        {g.namedTitle}
                      </div>
                    ) : null}
                    <div className="space-y-0.5">
                      {lines.map((line, idx) => (
                        <div
                          key={`${g.id}-line-${idx}`}
                          className="truncate text-[13px] leading-snug font-medium text-text"
                          title={line}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-0.5 pt-0.5 text-[11px] tabular-nums text-muted">
                    <MessageIcon className="size-3.5 opacity-80" />
                    {g.messageCount.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-muted">
                    {dateLabel}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted">
                    <PeopleCountIcon className="size-3.5 opacity-80" />
                    {g.participantCount.toLocaleString()}
                  </span>
                </div>
              </button>
              {showInsetDivider && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-3 bottom-0 left-3 h-px bg-border/60"
                />
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
