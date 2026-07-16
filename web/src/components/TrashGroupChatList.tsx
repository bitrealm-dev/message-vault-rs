"use client";

import type { GroupParticipant, GroupYearRow } from "@/lib/types";
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
  participants: GroupParticipant[];
  participantCount: number;
  messageCount: number;
  conversationDateStart: string;
  conversationDateEnd: string;
  namedTitle: string | null;
  title: string;
};

const NAME_SEP = "  ·  ";
const MAX_VISIBLE_NAMES = 8;

/** Visible gap around · — flex items trim ordinary spaces. */
function NameSep() {
  return (
    <span className="px-1.5 font-normal text-muted" aria-hidden>
      ·
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
        participants: r.participants ?? [],
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
    if (prev.participants.length === 0 && (r.participants?.length ?? 0) > 0) {
      prev.participants = r.participants;
    }
  }
  return [...map.values()];
}

function participantLabels(g: TrashGroupConversation): string[] {
  return g.participantNames.length > 0
    ? g.participantNames
    : g.participantHandles;
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
  emptyLabel = "No trashed group chats",
}: {
  items: TrashGroupConversation[];
  conversationId: number | null;
  selectedIds: Set<number>;
  query: string;
  groupDateFormat: GroupDateFormat;
  onSelectColumnClick: (id: number, e: MouseEvent) => void;
  onRowClick: (g: TrashGroupConversation, e: MouseEvent) => void;
  onOpenCtxMenu?: (id: number, x: number, y: number) => void;
  emptyLabel?: string;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {items.length === 0 && (
          <p className="px-3 py-4 text-[12px] text-muted">
            {query.trim() ? "No matches" : emptyLabel}
          </p>
        )}
        {items.map((g, i) => {
          const active = g.id === conversationId;
          const checked = selectedIds.has(g.id);
          const selectionActive = selectedIds.size >= 1;
          const showInsetDivider = i < items.length - 1;
          const allNames = participantLabels(g);
          const names = visibleParticipantLabels(allNames);
          const namesTitle = allNames.join(NAME_SEP);
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
                onContextMenu={
                  onOpenCtxMenu
                    ? (e) => {
                        e.preventDefault();
                        onOpenCtxMenu(g.id, e.clientX, e.clientY);
                      }
                    : undefined
                }
                className="min-w-0 flex-1 text-left outline-none"
              >
                <div className="flex w-full gap-2">
                  <div className="min-w-0 flex-1">
                    {g.namedTitle ? (
                      <div className="mb-1 truncate text-[12px] font-medium text-text">
                        {g.namedTitle}
                      </div>
                    ) : null}
                    <div
                      className="flex min-w-0 flex-wrap gap-y-0.5 text-[13px] leading-snug font-medium text-text"
                      title={namesTitle}
                    >
                      {names.map((name, idx) => (
                        <span
                          key={`${g.id}-name-${idx}`}
                          className="whitespace-nowrap"
                        >
                          {name}
                          {idx < names.length - 1 ? <NameSep /> : null}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1.5 truncate font-mono text-[12px] text-muted">
                      {dateLabel}
                    </div>
                  </div>
                  <div className="flex w-[4.5rem] shrink-0 flex-col items-end justify-between pt-0.5">
                    <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-muted">
                      <MessageIcon className="size-3.5 opacity-80" />
                      {g.messageCount.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-muted">
                      <PeopleCountIcon className="size-3.5 opacity-80" />
                      {g.participantCount.toLocaleString()}
                    </span>
                  </div>
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
