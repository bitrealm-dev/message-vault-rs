"use client";

import type { ContactDetail, MessageRow, YearThread } from "@/lib/types";
import { formatSourceLabel } from "@/lib/sourceLabels";
import { useMemo, useRef } from "react";
import { displayGroupNames } from "./contactEdit";
import { PeopleGroupIcon, PhoneIcon } from "./icons";
import { MessageBubble } from "./MessageBubble";

function yearFromTimestamp(ts: string): number | null {
  const y = Number(ts.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export function BrowseThreadPane({
  detail,
  groups,
  excluded,
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
  threadTitle,
}: {
  detail: ContactDetail | null;
  groups: string[];
  excluded: boolean;
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
  /** When viewing a group thread, show this under the contact name. */
  threadTitle?: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayName = detail?.displayName ?? null;
  const phonesView = detail?.phones ?? [];
  const shownGroups = displayGroupNames(groups, excluded);

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

  return (
    <section className="flex h-full min-h-0 flex-col bg-bg">
      {detail && (
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="grid grid-cols-[auto_minmax(1rem,1fr)_max-content_max-content] items-baseline gap-x-4">
            <h1 className="col-start-1 row-start-1 whitespace-nowrap text-2xl font-semibold tracking-tight text-text">
              {displayName || "Contact"}
            </h1>
            {phonesView.length > 0 && (
              <>
                <div className="col-start-3 row-start-1 flex min-w-0 items-baseline gap-2 justify-self-end">
                  <PhoneIcon className="relative top-[3px] size-4 shrink-0 text-muted" />
                  <span className="min-w-0 truncate text-[12px] leading-5 tabular-nums text-text">
                    {phonesView[0]}
                  </span>
                </div>
                {phonesView.slice(1).map((phone, i) => (
                  <div
                    key={phone}
                    className="col-start-3 min-w-0 truncate text-right text-[12px] leading-5 tabular-nums text-text justify-self-end"
                    style={{ gridRow: i + 2 }}
                  >
                    {phone}
                  </div>
                ))}
              </>
            )}
            {shownGroups.length > 0 && (
              <>
                <div className="col-start-4 row-start-1 flex min-w-0 items-baseline justify-end gap-2 justify-self-end">
                  <PeopleGroupIcon className="relative top-[3px] size-4 shrink-0 text-muted" />
                  <span
                    className={
                      shownGroups[0] === "Inactive"
                        ? "min-w-0 truncate text-[12px] font-semibold leading-5 text-amber-400/90"
                        : "min-w-0 truncate text-[12px] leading-5 text-text"
                    }
                  >
                    {shownGroups[0]}
                  </span>
                </div>
                {shownGroups.slice(1).map((name, i) => (
                  <div
                    key={name}
                    className={
                      name === "Inactive"
                        ? "col-start-4 min-w-0 truncate text-right text-[12px] font-semibold leading-5 text-amber-400/90 justify-self-end"
                        : "col-start-4 min-w-0 truncate text-right text-[12px] leading-5 text-text justify-self-end"
                    }
                    style={{ gridRow: i + 2 }}
                  >
                    {name}
                  </div>
                ))}
              </>
            )}
          </div>
          {threadTitle && (
            <p className="mt-1 truncate text-[13px] text-muted">
              {threadTitle}
            </p>
          )}

          {stripItems.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-y-1.5">
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
              <div key={section.year} id={`year-${section.year}`} className="scroll-mt-3">
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
