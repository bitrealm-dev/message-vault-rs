"use client";

import type {
  ContactListItem,
  MessageRow,
  UnmatchedHandle,
  YearThread,
} from "@/lib/types";
import { searchContacts } from "@/lib/contactSearch";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  draftHasName,
  emptyContactEditDraft,
  type ContactEditDraft,
} from "./ContactEditPane";
import { MessageAttachments } from "./MessageAttachments";
import {
  UnmatchedSortMenu,
  type SortOrder,
  type UnmatchedSortBy,
} from "./SortByMenu";
import { useSourceFilter } from "./SourceFilter";
import { useResizablePanes } from "./useResizablePanes";

const UNMATCHED_SORT_ORDER_KEY = "mv-unmatched-sort-order";
const UNMATCHED_SORT_BY_KEY = "mv-unmatched-sort-by";

function formatSourceLabel(id: string): string {
  const known: Record<string, string> = {
    imessage: "iMessage",
    "go-sms-pro": "GO SMS Pro",
    "sms-backup-plus": "SMS Backup Plus",
    "sms-backup-restore": "SMS Backup Restore",
  };
  if (known[id]) return known[id];
  return id
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function UnmatchedShell({
  handles: initialHandles,
  assignContacts,
  initialHandle,
}: {
  handles: UnmatchedHandle[];
  assignContacts: ContactListItem[];
  initialHandle: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sources, source, setSource, sourceQuery } = useSourceFilter();
  const [handles, setHandles] = useState(initialHandles);
  const [sortBy, setSortByState] = useState<UnmatchedSortBy>(() => {
    if (typeof window === "undefined") return "phone";
    const v = localStorage.getItem(UNMATCHED_SORT_BY_KEY);
    return v === "phone" || v === "date" ? v : "phone";
  });
  const [sortOrder, setSortOrderState] = useState<SortOrder>(() => {
    if (typeof window === "undefined") return "asc";
    const v = localStorage.getItem(UNMATCHED_SORT_ORDER_KEY);
    return v === "asc" || v === "desc" ? v : "asc";
  });
  const setUnmatchedSort = useCallback(
    (next: { sortBy: UnmatchedSortBy; order: SortOrder }) => {
      setSortByState(next.sortBy);
      setSortOrderState(next.order);
      localStorage.setItem(UNMATCHED_SORT_BY_KEY, next.sortBy);
      localStorage.setItem(UNMATCHED_SORT_ORDER_KEY, next.order);
    },
    [],
  );
  const [handle, setHandle] = useState<string | null>(initialHandle);
  const [yearly, setYearly] = useState<YearThread[]>([]);
  const [messageSources, setMessageSources] = useState<string[]>([]);
  const [sourceCounts, setSourceCounts] = useState<{
    all: number;
    bySource: Record<string, number>;
  }>({ all: 0, bySource: {} });
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<ContactEditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const assignRef = useRef<HTMLDivElement>(null);
  const { sidebarWidth, threadsPct, startSide, startThreads, shellRef } =
    useResizablePanes("browse-unmatched");

  const selected = handles.find((h) => h.handle === handle) ?? null;

  const sortedHandles = useMemo(() => {
    const copy = [...handles];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") {
        const aDate = a.dateEnd ?? a.dateStart ?? "";
        const bDate = b.dateEnd ?? b.dateStart ?? "";
        cmp = aDate.localeCompare(bDate);
        if (cmp === 0) {
          cmp = a.handle.localeCompare(b.handle, undefined, {
            sensitivity: "base",
          });
        }
      } else {
        cmp = a.handle.localeCompare(b.handle, undefined, {
          sensitivity: "base",
        });
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [handles, sortBy, sortOrder]);

  const selectHandle = useCallback(
    (next: string) => {
      setHandle(next);
      setMessages([]);
      setActiveYear(null);
      setCreating(false);
      setCreateDraft(null);
      setAssignOpen(false);
      const params = new URLSearchParams(searchParams.toString());
      params.set("h", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setHandles(initialHandles);
    if (handle && !initialHandles.some((h) => h.handle === handle)) {
      setHandle(null);
      setYearly([]);
      setMessages([]);
      setActiveYear(null);
    }
  }, [initialHandles, handle]);

  useEffect(() => {
    if (!handle) {
      setYearly([]);
      setMessageSources([]);
      setSourceCounts({ all: 0, bySource: {} });
      return;
    }
    let cancelled = false;
    setLoadingThreads(true);
    const qs = new URLSearchParams({ handle });
    if (source) qs.set("source", source);
    fetch(`/api/unmatched/threads?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setYearly([]);
          setMessageSources([]);
          setSourceCounts({ all: 0, bySource: {} });
          return;
        }
        const nextYearly: YearThread[] = data.yearly ?? [];
        setYearly(nextYearly);
        setMessageSources(data.messageSources ?? []);
        setSourceCounts(data.sourceCounts ?? { all: 0, bySource: {} });

        const available: string[] = data.messageSources ?? [];
        if (source && !available.includes(source)) {
          setSource(null);
        }

        if (nextYearly.length === 1) {
          const y = nextYearly[0]!;
          setActiveYear(y.year);
          setLoadingMessages(true);
          const ids = y.conversationIds.join(",");
          fetch(
            `/api/messages?conversationIds=${ids}&year=${y.year}${sourceQuery}`,
          )
            .then((r) => r.json())
            .then((msgData) => {
              if (!cancelled) setMessages(msgData.messages ?? []);
            })
            .finally(() => {
              if (!cancelled) setLoadingMessages(false);
            });
        } else if (
          activeYear != null &&
          nextYearly.some((t) => t.year === activeYear)
        ) {
          const y = nextYearly.find((t) => t.year === activeYear)!;
          setLoadingMessages(true);
          const ids = y.conversationIds.join(",");
          fetch(
            `/api/messages?conversationIds=${ids}&year=${y.year}${sourceQuery}`,
          )
            .then((r) => r.json())
            .then((msgData) => {
              if (!cancelled) setMessages(msgData.messages ?? []);
            })
            .finally(() => {
              if (!cancelled) setLoadingMessages(false);
            });
        } else {
          setActiveYear(null);
          setMessages([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingThreads(false);
      });
    return () => {
      cancelled = true;
    };
    // activeYear intentionally omitted — only reload on handle/source change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, source, sourceQuery, setSource]);

  const loadYear = (year: number, conversationIds: number[]) => {
    setActiveYear(year);
    setLoadingMessages(true);
    const ids = conversationIds.join(",");
    fetch(`/api/messages?conversationIds=${ids}&year=${year}${sourceQuery}`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages ?? []))
      .finally(() => setLoadingMessages(false));
  };

  const beginCreate = () => {
    if (!handle) return;
    setAssignOpen(false);
    setCreating(true);
    setCreateDraft({
      ...emptyContactEditDraft(),
      phones: [handle, ""],
    });
  };

  const saveCreate = async () => {
    if (!createDraft || !handle || !draftHasName(createDraft)) return;
    setSaving(true);
    try {
      const phones = [
        handle,
        ...createDraft.phones
          .map((p) => p.trim())
          .filter((p) => p && p !== handle),
      ];
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: createDraft.firstName.trim() || null,
          lastName: createDraft.lastName.trim() || null,
          phones,
          exclude: false,
          tags: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");
      router.push(`/all?c=${data.contact.id}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const assignFiltered = useMemo(() => {
    const q = assignQuery.trim();
    const pool = assignContacts;
    if (!q) return pool.slice(0, 40);
    return searchContacts(pool, q).slice(0, 40);
  }, [assignContacts, assignQuery]);

  useEffect(() => {
    if (!assignOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!assignRef.current?.contains(e.target as Node)) setAssignOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [assignOpen]);

  const assignToContact = async (contactId: number) => {
    if (!handle) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/phones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: handle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "assign failed");
      setAssignOpen(false);
      setStatus(`Added to ${data.contact.displayName}`);
      setHandles((prev) => prev.filter((h) => h.handle !== handle));
      setHandle(null);
      setYearly([]);
      setMessages([]);
      setActiveYear(null);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("h");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      router.refresh();
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={shellRef} className="flex h-full min-h-0">
      <aside
        className="flex shrink-0 flex-col bg-sidebar"
        style={{ width: sidebarWidth }}
      >
        <div className="flex h-[45px] shrink-0 items-center justify-between border-b border-border px-3">
          <h2 className="text-[13px] font-medium text-text">
            Unmatched{" "}
            <span className="text-muted">({handles.length})</span>
          </h2>
          <UnmatchedSortMenu
            sortBy={sortBy}
            order={sortOrder}
            onChange={setUnmatchedSort}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sortedHandles.length === 0 && (
            <p className="px-3 py-4 text-[12px] text-muted">
              No unmatched 1:1 threads
            </p>
          )}
          {sortedHandles.map((h) => {
            const active = h.handle === handle;
            return (
              <button
                key={h.handle}
                type="button"
                onClick={() => selectHandle(h.handle)}
                className={`relative flex w-full flex-col border-b border-border/60 px-3 py-2 text-left ${
                  active ? "bg-elevated hover:bg-white/18" : "hover:bg-white/20"
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-[#c8c8c8]"
                  />
                )}
                <span className="truncate text-[13px] text-text">
                  {h.displayName}
                </span>
                {h.nameHint && (
                  <span className="truncate text-[11px] text-muted">
                    {h.handle}
                  </span>
                )}
                <span className="text-[11px] text-muted">
                  {h.messageCount} msgs
                  {h.dateStart
                    ? ` · ${h.dateStart}${
                        h.dateEnd && h.dateEnd !== h.dateStart
                          ? ` — ${h.dateEnd}`
                          : ""
                      }`
                    : ""}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startSide}
        className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-accent/60"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[45px] shrink-0 items-center justify-between gap-3 border-b border-border bg-panel px-4">
          <h1 className="truncate text-[15px] font-semibold text-text">
            {selected?.displayName ?? "Unmatched"}
          </h1>
          {selected && !creating && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={beginCreate}
                className="rounded-md border border-border px-2.5 py-1 text-[12px] text-text hover:bg-white/15"
              >
                Create contact
              </button>
              <div className="relative" ref={assignRef}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setAssignOpen((o) => !o);
                    setAssignQuery("");
                  }}
                  className="rounded-md border border-border px-2.5 py-1 text-[12px] text-text hover:bg-white/15"
                >
                  Add to existing
                </button>
                {assignOpen && (
                  <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-border bg-elevated shadow-xl">
                    <input
                      autoFocus
                      value={assignQuery}
                      onChange={(e) => setAssignQuery(e.target.value)}
                      placeholder="Search contacts…"
                      className="w-full border-b border-border bg-transparent px-3 py-2 text-[13px] text-text outline-none placeholder:text-muted"
                    />
                    <div className="max-h-64 overflow-y-auto py-1">
                      {assignFiltered.length === 0 ? (
                        <p className="px-3 py-2 text-[12px] text-muted">
                          No matches
                        </p>
                      ) : (
                        assignFiltered.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => void assignToContact(c.id)}
                            className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-white/15"
                          >
                            <span className="truncate text-[13px] text-text">
                              {c.displayName}
                            </span>
                            {c.preferredPhone && (
                              <span className="truncate text-[11px] text-muted">
                                {c.preferredPhone}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {creating && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={saving || !createDraft || !draftHasName(createDraft)}
                onClick={() => void saveCreate()}
                className="rounded-md bg-accent px-2.5 py-1 text-[12px] text-white disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setCreating(false);
                  setCreateDraft(null);
                }}
                className="rounded-md border border-border px-2.5 py-1 text-[12px] text-text hover:bg-white/15"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {status && (
          <div className="border-b border-border bg-elevated px-4 py-1.5 text-[12px] text-muted">
            {status}
          </div>
        )}

        <section
          className="flex flex-col overflow-y-auto bg-panel px-5 py-4"
          style={{ height: `${threadsPct}%`, minHeight: 140 }}
        >
          {!selected && (
            <p className="text-[13px] text-muted">
              Choose an unmatched number or email to read messages, then create
              a contact or add the handle to someone existing.
            </p>
          )}
          {selected && (
            <>
              {creating && createDraft ? (
                <div className="max-w-md space-y-3">
                  <p className="text-[12px] text-muted">
                    Creating contact for{" "}
                    <span className="text-text">{handle}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-[11px] text-muted">
                      First name
                      <input
                        value={createDraft.firstName}
                        onChange={(e) =>
                          setCreateDraft({
                            ...createDraft,
                            firstName: e.target.value,
                          })
                        }
                        className="mt-0.5 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-[13px] text-text outline-none"
                      />
                    </label>
                    <label className="block text-[11px] text-muted">
                      Last name
                      <input
                        value={createDraft.lastName}
                        onChange={(e) =>
                          setCreateDraft({
                            ...createDraft,
                            lastName: e.target.value,
                          })
                        }
                        className="mt-0.5 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-[13px] text-text outline-none"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-muted">{selected.handle}</p>
                  {selected.dateStart && selected.dateEnd && (
                    <p className="mt-1 text-[12px] text-muted">
                      {selected.dateStart === selected.dateEnd
                        ? selected.dateStart
                        : `${selected.dateStart} — ${selected.dateEnd}`}
                    </p>
                  )}

                  {sources.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                        Message Sources
                      </h3>
                      <div className="mt-2 flex flex-wrap items-start gap-x-0 gap-y-2">
                        {[
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
                        ].map((opt, i) => {
                          const active =
                            opt.id === null
                              ? source === null
                              : source === opt.id;
                          const disabled = !opt.enabled;
                          return (
                            <span
                              key={opt.id ?? "all"}
                              className="flex items-start"
                            >
                              {i > 0 && (
                                <span
                                  className="mx-2 pt-0.5 text-[13px] text-muted/50"
                                  aria-hidden
                                >
                                  |
                                </span>
                              )}
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => {
                                  if (disabled) return;
                                  setSource(opt.id);
                                }}
                                className={`flex min-w-0 flex-col items-start text-left ${
                                  disabled ? "cursor-default" : ""
                                }`}
                              >
                                <span
                                  className={`text-[13px] ${
                                    disabled
                                      ? "text-muted/40"
                                      : active
                                        ? "text-accent"
                                        : "text-text hover:text-accent"
                                  }`}
                                >
                                  {opt.label}
                                </span>
                                <span className="mt-0.5 w-[6ch] text-[11px] tabular-nums text-muted">
                                  {opt.count.toLocaleString()}
                                </span>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <h3 className="mt-5 text-[11px] font-semibold tracking-wider text-muted uppercase">
                    Yearly messages
                  </h3>
                  {loadingThreads ? (
                    <p className="mt-2 text-[12px] text-muted">Loading…</p>
                  ) : yearly.length === 0 ? (
                    <p className="mt-2 text-[12px] text-muted">
                      No messages for this source
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {yearly.map((y) => (
                        <button
                          key={y.year}
                          type="button"
                          onClick={() => loadYear(y.year, y.conversationIds)}
                          className={`text-[13px] ${
                            activeYear === y.year
                              ? "text-accent"
                              : "text-text hover:text-accent"
                          }`}
                        >
                          <span className="font-medium">{y.year}</span>
                          <span className="ml-2 text-muted">
                            {y.messageCount}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>

        <div
          role="separator"
          aria-orientation="horizontal"
          onMouseDown={startThreads}
          className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-accent/60"
        />

        <section className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4">
          {!activeYear && (
            <p className="pt-8 text-center text-[13px] text-muted">
              Select a year to read messages.
            </p>
          )}
          {loadingMessages && activeYear && (
            <p className="pt-8 text-center text-[13px] text-muted">Loading…</p>
          )}
          {!loadingMessages && messages.length > 0 && (
            <div className="mx-auto flex max-w-2xl flex-col gap-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${
                    m.isFromMe ? "items-end" : "items-start"
                  }`}
                >
                  {!m.isFromMe && (
                    <span className="mb-0.5 px-1 text-[10px] text-muted">
                      {m.senderName}
                    </span>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-[14px] leading-snug ${
                      m.isFromMe
                        ? "rounded-br-md bg-sent text-sent-text"
                        : "rounded-bl-md bg-received text-received-text"
                    }`}
                  >
                    {m.body && (
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    )}
                    <MessageAttachments
                      source={m.source}
                      attachments={m.attachments}
                      hasBody={Boolean(m.body)}
                    />
                  </div>
                  <span className="mt-0.5 px-1 text-[10px] text-muted">
                    {m.timestamp.replace("T", " ").slice(0, 19)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
