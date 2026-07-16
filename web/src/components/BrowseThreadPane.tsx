"use client";

import type {
  ContactDetail,
  GroupParticipant,
  MessageRow,
  YearThread,
} from "@/lib/types";
import { formatSourceLabel } from "@/lib/sourceLabels";
import { useMemo, useRef } from "react";
import {
  GroupParticipantChip,
  GroupParticipantNameSep,
} from "./GroupParticipantChip";
import { MessageBubble } from "./MessageBubble";
import { MessageIcon, PaperclipIcon } from "./icons";

function yearFromTimestamp(ts: string): number | null {
  const y = Number(ts.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export type BrowseGroupThreadMeta = {
  participants: GroupParticipant[];
  dateStart: string;
  dateEnd: string;
  messageCount: number;
};

export function BrowseThreadPane({
  detail,
  sources,
  messageSources,
  sourceCounts,
  source,
  onSourceChange,
  yearly,
  messages,
  loadingMessages,
  threadsReady = false,
  activeThread,
  groupThread,
  onParticipantClick,
}: {
  detail: ContactDetail | null;
  sources: string[];
  messageSources: string[];
  sourceCounts: { all: number; bySource: Record<string, number> };
  source: string | null;
  onSourceChange: (id: string | null) => void;
  yearly: YearThread[];
  messages: MessageRow[];
  loadingMessages: boolean;
  /** True once the current contact's threads have finished loading (so an empty state means "no messages"). */
  threadsReady?: boolean;
  activeThread: string | null;
  /** When viewing a group thread, show participants / date / counts under the contact name. */
  groupThread?: BrowseGroupThreadMeta | null;
  onParticipantClick?: (participant: GroupParticipant) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayName = detail?.displayName ?? null;
  const threadStats = useMemo(() => {
    if (groupThread) {
      return {
        messageCount: groupThread.messageCount,
        attachmentCount: messages.reduce((n, m) => n + m.attachments.length, 0),
      };
    }
    if (activeThread === "dm" && yearly.length > 0) {
      return {
        messageCount: yearly.reduce((n, y) => n + y.messageCount, 0),
        attachmentCount: yearly.reduce((n, y) => n + y.attachmentCount, 0),
      };
    }
    if (messages.length > 0) {
      return {
        messageCount: messages.length,
        attachmentCount: messages.reduce((n, m) => n + m.attachments.length, 0),
      };
    }
    return null;
  }, [groupThread, activeThread, yearly, messages]);

  const yearsInThread = useMemo(() => {
    if (yearly.length > 0 && activeThread === "dm") {
      return [...yearly].sort((a, b) => a.year - b.year);
    }
    const years = new Set<number>();
    for (const m of messages) {
      const y = yearFromTimestamp(m.timestamp);
      if (y != null) years.add(y);
    }
    return [...years]
      .sort((a, b) => a - b)
      .map((year) => ({
        year,
        messageCount: 0,
        attachmentCount: 0,
        dateStart: "",
        dateEnd: "",
        conversationIds: [] as number[],
      }));
  }, [yearly, messages, activeThread]);

  const messagesByYear = useMemo(() => {
    const chronological = [...messages].sort((a, b) =>
      a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
    );
    const sections: Array<{ year: number; messages: MessageRow[] }> = [];
    for (const m of chronological) {
      const y = yearFromTimestamp(m.timestamp) ?? 0;
      const last = sections[sections.length - 1];
      if (!last || last.year !== y) {
        sections.push({ year: y, messages: [m] });
      } else {
        last.messages.push(m);
      }
    }
    return sections;
  }, [messages]);

  const jumpToYear = (year: number) => {
    const el = scrollRef.current?.querySelector(`#year-${year}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sourceOptions = [
    {
      id: null as string | null,
      label: "Combined",
      enabled: true,
      count: sourceCounts.all,
    },
    ...sources.map((id) => ({
      id,
      label: formatSourceLabel(id),
      enabled: messageSources.includes(id),
      count: sourceCounts.bySource[id] ?? 0,
    })),
  ];

  const stripItems: Array<{
    key: string;
    label: string;
    title?: string;
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
  }> = sourceOptions.map((opt) => ({
    key: `src-${opt.id ?? "all"}`,
    label: opt.label,
    title: `${opt.label}: ${opt.count.toLocaleString()} messages`,
    active: opt.id === null ? source === null : source === opt.id,
    disabled: !opt.enabled,
    onClick: () => {
      if (!opt.enabled) return;
      onSourceChange(opt.id);
    },
  }));

  const yearItems = yearsInThread.map((y) => ({
    key: `y-${y.year}`,
    label: String(y.year),
    title:
      y.messageCount > 0
        ? `${y.year}: ${y.messageCount.toLocaleString()} messages`
        : `Jump to ${y.year}`,
    onClick: () => jumpToYear(y.year),
  }));

  const dateLabel = groupThread
    ? groupThread.dateStart === groupThread.dateEnd
      ? groupThread.dateStart
      : `${groupThread.dateStart} — ${groupThread.dateEnd}`
    : null;

  return (
    <section className="flex h-full min-h-0 flex-col bg-bg">
      {detail && (
        <div className="shrink-0 border-b border-border px-5 py-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            {displayName || "Contact"}
          </h1>

          {groupThread && groupThread.participants.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-y-0.5 text-[14px] font-medium text-text">
              {groupThread.participants.map((p, idx) => (
                <span
                  key={`${p.handle}-${idx}`}
                  className="inline-flex items-center"
                >
                  {onParticipantClick ? (
                    <GroupParticipantChip
                      label={p.name}
                      onClick={() => onParticipantClick(p)}
                    />
                  ) : (
                    <span className="whitespace-nowrap px-1.5 py-0.5">
                      {p.name}
                    </span>
                  )}
                  {idx < groupThread.participants.length - 1 ? (
                    <GroupParticipantNameSep />
                  ) : null}
                </span>
              ))}
            </div>
          )}

          {dateLabel && (
            <div className="mt-1.5 text-[14px] text-muted tabular-nums">
              {dateLabel}
            </div>
          )}

          {threadStats && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <MessageIcon className="size-3.5 shrink-0 opacity-80" />
                {threadStats.messageCount.toLocaleString()}
              </span>
              <span className="opacity-50">·</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <PaperclipIcon className="size-3.5 shrink-0 opacity-80" />
                {threadStats.attachmentCount.toLocaleString()}
              </span>
            </div>
          )}

          {stripItems.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-y-1.5">
              {stripItems.map((item, i) => (
                <span key={item.key} className="flex items-center">
                  {i > 0 && (
                    <span
                      className="mx-2 text-[13px] text-muted/50"
                      aria-hidden
                    >
                      |
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={item.disabled}
                    title={item.title}
                    onClick={item.onClick}
                    className={`text-[13px] font-medium ${
                      item.disabled
                        ? "cursor-default text-muted/40"
                        : item.active
                          ? "text-accent"
                          : "text-text hover:text-accent"
                    }`}
                  >
                    {item.label}
                  </button>
                </span>
              ))}
            </div>
          )}

          {yearItems.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
              {yearItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  title={item.title}
                  onClick={item.onClick}
                  className="text-[13px] font-medium tabular-nums text-text hover:text-accent"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {!activeThread && !loadingMessages && (
          <p className="pt-8 text-center text-[13px] text-muted">
            {!detail
              ? "Choose a contact to read messages."
              : threadsReady
                ? "No messages"
                : "Loading messages…"}
          </p>
        )}
        {loadingMessages && messages.length === 0 && (
          <p className="pt-8 text-center text-[13px] text-muted">
            Loading messages…
          </p>
        )}
        {messages.length > 0 && (
          <div
            className={`mx-auto flex max-w-2xl flex-col gap-2 ${
              loadingMessages ? "opacity-60" : ""
            }`}
          >
            {messagesByYear.map((section) => (
              <div
                key={section.year}
                id={`year-${section.year}`}
                className="scroll-mt-3"
              >
                <div className="sticky top-0 z-10 -mx-1 mb-2 bg-bg/95 px-1 py-1.5 backdrop-blur-sm">
                  <div className="text-[13px] font-semibold text-text">
                    {section.year || "Unknown"}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {section.messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
