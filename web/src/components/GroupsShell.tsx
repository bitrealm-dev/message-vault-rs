"use client";

import type { GroupYearRow, MessageRow } from "@/lib/types";
import { searchGroups } from "@/lib/groupSearch";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageBubble } from "./MessageBubble";
import { useSourceFilter } from "./SourceFilter";
import { useResizablePanes } from "./useResizablePanes";

type GroupDateFormat = "md" | "mon-d" | "d-mon";

const GROUP_DATE_FORMAT_KEY = "mv-group-date-format";
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatGroupDate(isoDate: string, style: GroupDateFormat): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const year = m[1];
  const monthNum = Number(m[2]);
  const dayNum = Number(m[3]);
  const mon = MONTH_SHORT[monthNum - 1] ?? m[2];
  switch (style) {
    case "mon-d":
      return `${mon} ${dayNum}, ${year}`;
    case "d-mon":
      return `${dayNum} ${mon} ${year}`;
    case "md":
    default:
      return `${m[2]}-${m[3]}-${year}`;
  }
}

function groupDateMeta(
  g: { dateStart: string; dateEnd: string },
  style: GroupDateFormat,
): string {
  const start = formatGroupDate(g.dateStart, style);
  if (g.dateEnd === g.dateStart) return start;
  return `${start} – ${formatGroupDate(g.dateEnd, style)}`;
}

function readStoredGroupDateFormat(): GroupDateFormat {
  if (typeof window === "undefined") return "md";
  const v = localStorage.getItem(GROUP_DATE_FORMAT_KEY);
  if (v === "md" || v === "mon-d" || v === "d-mon") return v;
  return "md";
}

export function GroupsShell({
  groups,
  initialGroupId,
  initialYear,
}: {
  groups: GroupYearRow[];
  initialGroupId: number | null;
  initialYear: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sourceQuery } = useSourceFilter();
  const [groupId, setGroupId] = useState<number | null>(initialGroupId);
  const [focusYear, setFocusYear] = useState<number | null>(initialYear);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [groupDateFormat, setGroupDateFormatState] =
    useState<GroupDateFormat>("md");
  const { threadsPct, startThreads, shellRef } = useResizablePanes("groups");
  const messagesPaneRef = useRef<HTMLElement>(null);
  const pendingScrollYearRef = useRef<number | null>(initialYear);

  const filtered = useMemo(
    () => searchGroups(groups, query),
    [groups, query],
  );

  const years = useMemo(() => {
    const source = query.trim() ? filtered : groups;
    const set = new Set<number>();
    for (const g of source) set.add(g.year);
    return [...set].sort((a, b) => b - a);
  }, [groups, filtered, query]);

  const rowsByYear = useMemo(() => {
    const map = new Map<number, GroupYearRow[]>();
    for (const g of filtered) {
      const list = map.get(g.year) ?? [];
      list.push(g);
      map.set(g.year, list);
    }
    return [...map.entries()].sort(([a], [b]) => b - a);
  }, [filtered]);

  const selectedRow = useMemo(() => {
    if (groupId == null) return null;
    if (focusYear != null) {
      const match = groups.find(
        (g) => g.id === groupId && g.year === focusYear,
      );
      if (match) return match;
    }
    return groups.find((g) => g.id === groupId) ?? null;
  }, [groups, groupId, focusYear]);

  useEffect(() => {
    setGroupDateFormatState(readStoredGroupDateFormat());
  }, []);

  const setGroupDateFormat = useCallback((next: GroupDateFormat) => {
    setGroupDateFormatState(next);
    localStorage.setItem(GROUP_DATE_FORMAT_KEY, next);
  }, []);

  const jumpToYearSection = useCallback((year: number) => {
    const el = document.getElementById(`group-year-${year}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const selectGroup = useCallback(
    (row: GroupYearRow) => {
      setGroupId(row.id);
      setFocusYear(row.year);
      setMessages([]);
      pendingScrollYearRef.current = row.year;
      const params = new URLSearchParams(searchParams.toString());
      params.set("g", String(row.id));
      params.set("y", String(row.year));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!groupId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/messages?conversationIds=${groupId}${sourceQuery}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setMessages(data.messages ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, sourceQuery]);

  useEffect(() => {
    const year = pendingScrollYearRef.current;
    if (year == null || loading || messages.length === 0) return;
    const pane = messagesPaneRef.current;
    if (!pane) return;

    const prefix = `${year}-`;
    const target = pane.querySelector(
      `[data-timestamp^="${prefix}"]`,
    ) as HTMLElement | null;
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    pendingScrollYearRef.current = null;
  }, [loading, messages, focusYear]);

  const activeKey =
    groupId != null && focusYear != null ? `${groupId}-${focusYear}` : null;

  return (
    <div ref={shellRef} className="flex h-full min-h-0 flex-col bg-bg">
      <div id="groups-split" className="flex min-h-0 flex-1 flex-col">
        <section
          className="min-h-0 flex flex-col overflow-hidden bg-bg"
          style={{ height: `${threadsPct}%` }}
        >
          <div className="shrink-0 border-b border-border/60 bg-bg px-5 pt-4 pb-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                Group messages
                <span className="ml-2 font-normal normal-case tracking-normal">
                  {query.trim() ? `${filtered.length}/` : ""}
                  {groups.length}
                </span>
              </h2>
              <label className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="sr-only">Date format</span>
                <select
                  value={groupDateFormat}
                  onChange={(e) =>
                    setGroupDateFormat(e.target.value as GroupDateFormat)
                  }
                  className="rounded border border-border bg-elevated px-1.5 py-0.5 text-[11px] text-text outline-none"
                >
                  <option value="md">01-31-2025</option>
                  <option value="mon-d">Jan 31, 2025</option>
                  <option value="d-mon">31 Jan 2025</option>
                </select>
              </label>
            </div>

            <div className="mb-3">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or phone…"
                className="w-full max-w-md rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent"
              />
            </div>

            {years.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => jumpToYearSection(y)}
                    className="text-[13px] font-medium text-text hover:text-accent"
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-bg">
            {groups.length === 0 ? (
              <p className="mt-2 px-5 text-[12px] text-muted">No group messages</p>
            ) : rowsByYear.length === 0 ? (
              <p className="mt-2 px-5 text-[12px] text-muted">No matching groups</p>
            ) : (
              rowsByYear.map(([year, items], yearIdx) => (
                <div key={year} id={`group-year-${year}`} className="pb-6">
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-bg px-5 py-1.5">
                    <div className="text-[13px] font-semibold text-text">
                      {year}
                    </div>
                    {yearIdx === 0 && (
                      <span className="text-[11px] text-muted">
                        {items.length} group{items.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <ul className="divide-y divide-border/50 border-b border-border/50 px-5">
                    {items.map((g) => {
                      const key = `${g.id}-${g.year}`;
                      const active = activeKey === key;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            title={g.titleFull}
                            onClick={() => selectGroup(g)}
                            className={`flex w-full items-start justify-between gap-4 rounded-md px-2 py-2 text-left text-[13px] ${
                              active
                                ? "bg-white/12 text-accent"
                                : "text-text hover:bg-white/20 hover:text-accent"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="line-clamp-2 font-medium leading-snug">
                                {g.title}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-muted">
                                {g.participantCount} people
                                <span className="mx-1.5">·</span>
                                {g.messageCount} msgs
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[11px] text-muted tabular-nums">
                              {g.spansMultipleYears && (
                                <span
                                  title="Spans multiple years"
                                  aria-label="Spans multiple years"
                                  className="text-muted"
                                >
                                  ↔
                                </span>
                              )}
                              <span>{groupDateMeta(g, groupDateFormat)}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </section>

        <div
          role="separator"
          aria-orientation="horizontal"
          onMouseDown={startThreads}
          className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-accent/60"
        />

        <section
          ref={messagesPaneRef}
          className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4"
        >
          {!selectedRow && (
            <p className="pt-8 text-center text-[13px] text-muted">
              Select a group to read messages.
            </p>
          )}
          {selectedRow && loading && messages.length === 0 && (
            <p className="pt-8 text-center text-[13px] text-muted">
              Loading messages…
            </p>
          )}
          {selectedRow && !loading && messages.length === 0 && (
            <p className="pt-8 text-center text-[13px] text-muted">No messages</p>
          )}
          {selectedRow && messages.length > 0 && (
            <div
              className={`mx-auto flex max-w-2xl flex-col gap-2 ${
                loading ? "opacity-60" : ""
              }`}
            >
              <div className="mb-2 border-b border-border/60 pb-2 text-center">
                <div className="text-[13px] font-medium text-text">
                  {selectedRow.participantNames.length > 0
                    ? selectedRow.participantNames.join("\u00a0\u00a0·\u00a0\u00a0")
                    : selectedRow.title}
                </div>
                {selectedRow.namedTitle ? (
                  <div className="mt-0.5 text-[12px] text-muted">
                    {selectedRow.namedTitle}
                  </div>
                ) : null}
                <div className="mt-0.5 text-[12px] text-muted">
                  {selectedRow.spansMultipleYears
                    ? `${selectedRow.conversationDateStart} — ${selectedRow.conversationDateEnd}`
                    : selectedRow.dateStart === selectedRow.dateEnd
                      ? selectedRow.dateStart
                      : `${selectedRow.dateStart} — ${selectedRow.dateEnd}`}
                  {focusYear != null && selectedRow.spansMultipleYears ? (
                    <>
                      <span className="mx-1.5">·</span>
                      starting {focusYear}
                    </>
                  ) : null}
                </div>
              </div>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
