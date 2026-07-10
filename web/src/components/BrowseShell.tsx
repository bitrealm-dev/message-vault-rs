"use client";

import type { ContactListItem, MessageRow } from "@/lib/types";
import { searchContacts } from "@/lib/contactSearch";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SortByMenu, type SortMode } from "./SortByMenu";
import { GroupsMenu } from "./GroupsMenu";
import { useResizablePanes } from "./useResizablePanes";

type YearThread = {
  year: number;
  messageCount: number;
  dateStart: string;
  dateEnd: string;
  conversationIds: number[];
};

type GroupThread = {
  conversationId: number;
  title: string;
  titleFull: string;
  namedTitle: string | null;
  participantCount: number;
  year: number;
  messageCount: number;
  dateStart: string;
  dateEnd: string;
};

type ContactDetail = ContactListItem & {
  display: boolean;
  status: string;
  tags: string[];
  phones: string[];
  dateStart: string | null;
  dateEnd: string | null;
};

/** Format YYYY-MM-DD as MM-DD (year comes from the section header). */
function formatShortDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return m ? `${m[2]}-${m[3]}` : isoDate;
}

function groupDateMeta(g: {
  dateStart: string;
  dateEnd: string;
}): string {
  const start = formatShortDate(g.dateStart);
  if (g.dateEnd === g.dateStart) return start;
  return `${start} – ${formatShortDate(g.dateEnd)}`;
}

export function BrowseShell({
  section,
  sectionLabel,
  contacts,
  allTags = [],
  initialContactId,
}: {
  section: string;
  sectionLabel: string;
  contacts: ContactListItem[];
  allTags?: string[];
  initialContactId: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sort, setSort] = useState<SortMode>("last");
  const [query, setQuery] = useState("");
  const [contactId, setContactId] = useState<number | null>(initialContactId);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [yearly, setYearly] = useState<YearThread[]>([]);
  const [groups, setGroups] = useState<GroupThread[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const { sidebarWidth, threadsPct, startSide, startThreads, shellRef } =
    useResizablePanes(`browse-${section}`);

  const saveContactPatch = useCallback(
    async (patch: {
      display?: boolean;
      status?: "current" | "historical";
      tags?: string[];
    }): Promise<boolean> => {
      if (!contactId) return false;
      setSaving(true);
      try {
        const res = await fetch(`/api/contacts/${contactId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "save failed");
        if (data.contact) setDetail(data.contact);
        return true;
      } catch (err) {
        console.error(err);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [contactId],
  );

  const sorted = useMemo(() => {
    const q = query.trim();
    if (q) {
      return searchContacts(contacts, q);
    }
    const copy = [...contacts];
    copy.sort((a, b) => {
      if (sort === "first") {
        return (
          a.sortFirst.localeCompare(b.sortFirst, undefined, { sensitivity: "base" }) ||
          a.sortLast.localeCompare(b.sortLast, undefined, { sensitivity: "base" })
        );
      }
      return (
        a.sortLast.localeCompare(b.sortLast, undefined, { sensitivity: "base" }) ||
        a.sortFirst.localeCompare(b.sortFirst, undefined, { sensitivity: "base" })
      );
    });
    return copy;
  }, [contacts, sort, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ContactListItem[]>();
    for (const c of sorted) {
      const letter =
        sort === "first"
          ? (() => {
              const ch = c.sortFirst.charAt(0).toUpperCase();
              return ch >= "A" && ch <= "Z" ? ch : "#";
            })()
          : c.letter;
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(c);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
  }, [sorted, sort]);

  const selectContact = useCallback(
    (id: number) => {
      setContactId(id);
      setMessages([]);
      setActiveThread(null);
      const params = new URLSearchParams(searchParams.toString());
      params.set("c", String(id));
      params.delete("y");
      params.delete("conv");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setSelectedIds(new Set());
  }, [section, query]);

  const sortedIndexById = useMemo(() => {
    const map = new Map<number, number>();
    sorted.forEach((c, i) => map.set(c.id, i));
    return map;
  }, [sorted]);

  const applyRangeSelect = useCallback(
    (id: number) => {
      const clickIndex = sortedIndexById.get(id);
      if (clickIndex === undefined) return;

      const selectedIndices: number[] = [];
      for (const sid of selectedIds) {
        const idx = sortedIndexById.get(sid);
        if (idx !== undefined) selectedIndices.push(idx);
      }

      if (selectedIndices.length === 0) {
        setSelectedIds(new Set([id]));
        return;
      }

      const minSel = Math.min(...selectedIndices);
      const maxSel = Math.max(...selectedIndices);
      const from = Math.min(minSel, clickIndex);
      const to = Math.max(maxSel, clickIndex);
      const next = new Set<number>();
      for (let i = from; i <= to; i++) {
        const c = sorted[i];
        if (c) next.add(c.id);
      }
      setSelectedIds(next);
    },
    [selectedIds, sorted, sortedIndexById],
  );

  /** Checkbox: toggle, or shift-range. */
  const toggleOrRangeSelect = useCallback(
    (id: number, shiftKey: boolean) => {
      if (shiftKey) {
        applyRangeSelect(id);
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [applyRangeSelect],
  );

  /**
   * Name/phone (or whole row when selection active):
   * - no selection → open detail only
   * - selection active → toggle that contact (shift = range)
   */
  const onNamePhoneClick = useCallback(
    (id: number, shiftKey: boolean) => {
      if (selectedIds.size === 0) {
        selectContact(id);
        return;
      }
      toggleOrRangeSelect(id, shiftKey);
    },
    [selectContact, selectedIds.size, toggleOrRangeSelect],
  );

  useEffect(() => {
    if (!contactId) {
      setDetail(null);
      setYearly([]);
      setGroups([]);
      return;
    }
    let cancelled = false;
    setLoadingThreads(true);
    fetch(`/api/contacts/${contactId}/threads`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setDetail(data.contact);
        setYearly(data.yearly ?? []);
        setGroups(data.groups ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoadingThreads(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  const loadMessages = useCallback(
    (conversationIds: number[], year: number, key: string) => {
      setActiveThread(key);
      setLoadingMessages(true);
      const ids = conversationIds.join(",");
      fetch(`/api/messages?conversationIds=${ids}&year=${year}`)
        .then((r) => r.json())
        .then((data) => setMessages(data.messages ?? []))
        .finally(() => setLoadingMessages(false));
    },
    [],
  );

  const groupsByYear = useMemo(() => {
    const map = new Map<number, GroupThread[]>();
    for (const g of groups) {
      if (!map.has(g.year)) map.set(g.year, []);
      map.get(g.year)!.push(g);
    }
    return [...map.entries()].sort(([a], [b]) => b - a);
  }, [groups]);

  const selectedContacts = useMemo(
    () => sorted.filter((c) => selectedIds.has(c.id)),
    [sorted, selectedIds],
  );
  const hasSelection = selectedContacts.length > 0;

  const activeThreadMeta = useMemo(() => {
    if (!activeThread) return null;
    if (activeThread.startsWith("y-")) {
      const y = yearly.find((t) => `y-${t.year}` === activeThread);
      if (!y) return null;
      return {
        title: String(y.year),
        dateStart: y.dateStart,
        dateEnd: y.dateEnd,
        messageCount: y.messageCount,
      };
    }
    const g = groups.find(
      (t) => `g-${t.conversationId}-${t.year}` === activeThread,
    );
    if (!g) return null;
    return {
      title: g.title,
      dateStart: g.dateStart,
      dateEnd: g.dateEnd,
      messageCount: g.messageCount,
    };
  }, [activeThread, yearly, groups]);

  return (
    <div ref={shellRef} className="flex h-full min-h-0">
      <aside
        className="flex shrink-0 flex-col bg-sidebar"
        style={{ width: sidebarWidth }}
      >
        <div className="flex h-[45px] shrink-0 items-center justify-between border-b border-border px-3">
          <h2 className="text-[13px] font-medium text-text">
            {sectionLabel}{" "}
            <span className="text-muted">
              ({query.trim() ? `${sorted.length}/` : ""}
              {contacts.length})
            </span>
          </h2>
          <SortByMenu sort={sort} onChange={setSort} />
        </div>
        <div className="flex h-[45px] shrink-0 items-center border-b border-border px-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sorted.length === 0 && (
            <p className="px-3 py-4 text-[12px] text-muted">No matches</p>
          )}
          {grouped.map(([letter, items]) => (
            <div key={letter}>
              {!query.trim() && (
                <div className="sticky top-0 z-10 border-b border-border bg-sidebar px-3 py-1 text-[11px] font-semibold text-muted">
                  {letter}
                </div>
              )}
              {items.map((c, i) => {
                const active = c.id === contactId;
                const checked = selectedIds.has(c.id);
                const showInsetDivider = i < items.length - 1;
                const selectionActive = selectedIds.size >= 1;
                return (
                  <div
                    key={c.id}
                    role={selectionActive ? "button" : undefined}
                    tabIndex={selectionActive ? 0 : undefined}
                    onClick={
                      selectionActive
                        ? (e) => onNamePhoneClick(c.id, e.shiftKey)
                        : undefined
                    }
                    onKeyDown={
                      selectionActive
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onNamePhoneClick(c.id, e.shiftKey);
                            }
                          }
                        : undefined
                    }
                    onMouseDown={(e) => {
                      if (e.shiftKey) e.preventDefault();
                    }}
                    className={`relative flex w-full items-start gap-2.5 px-3 py-2 select-none ${
                      selectionActive ? "cursor-pointer" : ""
                    } ${
                      checked || active
                        ? "bg-elevated"
                        : "hover:bg-elevated/50"
                    }`}
                  >
                    {active && !selectionActive && (
                      <span
                        aria-hidden
                        className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-[#c8c8c8]"
                      />
                    )}
                    <input
                      type="checkbox"
                      checked={checked}
                      aria-label={`Select ${c.displayName}`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const shiftKey =
                          "shiftKey" in e.nativeEvent &&
                          Boolean(
                            (e.nativeEvent as MouseEvent).shiftKey,
                          );
                        toggleOrRangeSelect(c.id, shiftKey);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (e.shiftKey) e.preventDefault();
                      }}
                      className="mt-0.5 size-3.5 shrink-0 rounded border-border accent-accent"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNamePhoneClick(c.id, e.shiftKey);
                      }}
                      onMouseDown={(e) => {
                        if (e.shiftKey) e.preventDefault();
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-[13px] text-text">
                        {c.displayName}
                      </span>
                      {c.preferredPhone && (
                        <span className="block truncate text-[11px] text-muted">
                          {c.preferredPhone}
                        </span>
                      )}
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
          ))}
        </div>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startSide}
        className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-accent/60"
      />

      <div
        id={`browse-${section}-right`}
        className="flex min-w-0 flex-1 flex-col"
      >
        <div className="flex h-[45px] shrink-0 items-center gap-2 border-b border-border px-5">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors ${
              editing
                ? "bg-accent/20 text-accent"
                : "bg-elevated text-muted hover:text-text"
            }`}
          >
            <PencilIcon className="size-3.5" />
            {editing ? "Read only" : "Edit"}
          </button>
          <GroupsMenu
            allGroups={allTags}
            selected={detail?.tags ?? []}
            disabled={saving || (!detail && !hasSelection)}
            onChange={(tags) => {
              void saveContactPatch({ tags }).then((ok) => {
                if (ok) router.refresh();
              });
            }}
          />
          {saving && <span className="text-[11px] text-muted">Saving…</span>}
        </div>

        <div className="flex h-[45px] shrink-0 items-center border-b border-border px-5">
          {hasSelection ? null : detail && !loadingThreads ? (
            <h1 className="truncate text-xl font-semibold tracking-tight text-text">
              {detail.displayName}
            </h1>
          ) : (
            <span className="text-[13px] text-muted">
              {!contactId
                ? "Choose a contact"
                : loadingThreads
                  ? "Loading…"
                  : ""}
            </span>
          )}
        </div>

        {hasSelection ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-bg px-5 pt-8 pb-5">
            <div className="rounded-xl border border-border bg-[#2c2c2e] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
                <h2 className="text-[14px] font-semibold text-text">
                  {selectedContacts.length} contact
                  {selectedContacts.length === 1 ? "" : "s"} selected
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="inline-flex items-center rounded-md bg-white/12 px-2.5 py-1 text-[12px] text-text transition-colors hover:bg-white/18"
                >
                  Clear selection
                </button>
              </div>
              <ul>
                {selectedContacts.map((c, i) => (
                  <li
                    key={c.id}
                    className={`flex items-center justify-between gap-4 px-4 py-2.5 ${
                      i < selectedContacts.length - 1
                        ? "border-b border-border/60"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectContact(c.id)}
                      className="min-w-0 truncate text-left text-[13px] text-text hover:text-accent"
                    >
                      {c.displayName}
                    </button>
                    <span className="shrink-0 text-[13px] text-muted tabular-nums">
                      {c.preferredPhone ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <>

        <section
          className="flex flex-col overflow-y-auto bg-panel px-5 py-4"
          style={{ height: `${threadsPct}%`, minHeight: 140 }}
        >
          {detail && !loadingThreads && (
            <>
              <div>
                <h2 className="text-[13px] font-semibold text-text">Contact details</h2>
                <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
                  <DetailRow
                    icon={<PeopleGroupIcon className="size-4 shrink-0 text-muted" />}
                    label="Groups"
                  >
                    {detail.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {detail.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1.5 text-[13px] text-text"
                          >
                            <PeopleGroupIcon className="size-3 opacity-70" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[13px] text-muted">None</span>
                    )}
                  </DetailRow>

                  <DetailRow
                    icon={<PhoneIcon className="size-4 shrink-0 text-muted" />}
                    label={detail.phones.length > 1 ? "Phones" : "Mobile"}
                  >
                    {detail.phones.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {detail.phones.map((phone) => (
                          <span key={phone} className="text-[13px] text-text">
                            {phone}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[13px] text-muted">None</span>
                    )}
                  </DetailRow>

                  <DetailRow
                    icon={<StatusIcon className="size-4 shrink-0 text-muted" />}
                    label="Display"
                  >
                    {editing ? (
                      <label className="inline-flex items-center gap-2 text-[13px] text-text">
                        <input
                          type="checkbox"
                          checked={detail.display}
                          disabled={saving}
                          onChange={(e) =>
                            saveContactPatch({ display: e.target.checked })
                          }
                          className="size-3.5 rounded border-border"
                        />
                        {detail.display ? "TRUE" : "FALSE"}
                      </label>
                    ) : (
                      <span className="text-[13px] text-text">
                        {detail.display ? "TRUE" : "FALSE"}
                      </span>
                    )}
                  </DetailRow>

                  <DetailRow
                    icon={<StatusIcon className="size-4 shrink-0 text-muted" />}
                    label="Status"
                  >
                    {editing ? (
                      <select
                        value={
                          detail.status === "historical" ? "historical" : "current"
                        }
                        disabled={saving}
                        onChange={(e) =>
                          saveContactPatch({
                            status: e.target.value as "current" | "historical",
                          })
                        }
                        className="rounded-md border border-border bg-elevated px-2 py-1 text-[13px] text-text outline-none focus:border-accent"
                      >
                        <option value="current">current</option>
                        <option value="historical">historical</option>
                      </select>
                    ) : (
                      <span className="text-[13px] capitalize text-text">
                        {detail.status || "current"}
                      </span>
                    )}
                  </DetailRow>

                  {detail.dateStart && detail.dateEnd && (
                    <DetailRow
                      icon={<RangeIcon className="size-4 shrink-0 text-muted" />}
                      label="Message range"
                    >
                      <span className="text-[13px] text-text">
                        {detail.dateStart === detail.dateEnd
                          ? detail.dateStart
                          : `${detail.dateStart} — ${detail.dateEnd}`}
                      </span>
                    </DetailRow>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Yearly messages
                </h3>
                {yearly.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted">No individual messages</p>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-y-1.5">
                    {yearly.map((y, i) => {
                      const key = `y-${y.year}`;
                      const active = activeThread === key;
                      return (
                        <span key={key} className="flex items-center">
                          {i > 0 && (
                            <span className="mx-2 text-[13px] text-muted/50" aria-hidden>
                              |
                            </span>
                          )}
                          <button
                            type="button"
                            title={`${y.messageCount} msgs · ${y.dateStart}${
                              y.dateEnd !== y.dateStart ? ` — ${y.dateEnd}` : ""
                            }`}
                            onClick={() =>
                              loadMessages(y.conversationIds, y.year, key)
                            }
                            className={`text-[13px] font-medium ${
                              active
                                ? "text-accent"
                                : "text-text hover:text-accent"
                            }`}
                          >
                            {y.year}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-5">
                <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Group messages
                </h3>
                {groupsByYear.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted">No group messages</p>
                ) : (
                  <div className="mt-3 space-y-12">
                    {groupsByYear.map(([year, items]) => (
                      <div key={year}>
                        <div className="mb-2 text-[13px] font-semibold text-text">
                          {year}
                        </div>
                        <ul className="divide-y divide-border/50 border-y border-border/50">
                          {items.map((g) => {
                            const key = `g-${g.conversationId}-${g.year}`;
                            const active = activeThread === key;
                            return (
                              <li key={key}>
                                <button
                                  type="button"
                                  title={g.titleFull}
                                  onClick={() =>
                                    loadMessages(
                                      [g.conversationId],
                                      g.year,
                                      key,
                                    )
                                  }
                                  className={`flex w-full items-start justify-between gap-4 py-2 text-left text-[13px] ${
                                    active
                                      ? "text-accent"
                                      : "text-text hover:text-accent"
                                  }`}
                                >
                                  <span className="min-w-0">
                                    <span className="line-clamp-2 font-medium leading-snug">
                                      {g.title}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                                      {g.namedTitle ? (
                                        <>
                                          {g.namedTitle}
                                          <span className="mx-1.5">·</span>
                                        </>
                                      ) : null}
                                      {g.participantCount} people
                                      <span className="mx-1.5">·</span>
                                      {g.messageCount} msgs
                                    </span>
                                  </span>
                                  <span className="shrink-0 pt-0.5 text-[11px] text-muted tabular-nums">
                                    {groupDateMeta(g)}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
          {!activeThread && (
            <p className="pt-8 text-center text-[13px] text-muted">
              Select a year or group thread to read messages.
            </p>
          )}
          {loadingMessages && (
            <p className="pt-8 text-center text-[13px] text-muted">Loading messages…</p>
          )}
          {!loadingMessages && activeThreadMeta && messages.length > 0 && (
            <div className="mx-auto flex max-w-2xl flex-col gap-2">
              <div className="mb-2 border-b border-border/60 pb-2 text-center">
                <div className="text-[13px] font-medium text-text">
                  {activeThreadMeta.title}
                </div>
                <div className="mt-0.5 text-[12px] text-muted">
                  {activeThreadMeta.messageCount} msgs
                  <span className="mx-1.5">·</span>
                  {activeThreadMeta.dateStart === activeThreadMeta.dateEnd
                    ? activeThreadMeta.dateStart
                    : `${activeThreadMeta.dateStart} — ${activeThreadMeta.dateEnd}`}
                </div>
              </div>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>
          )}
        </section>
          </>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: MessageRow }) {
  const align = message.isFromMe ? "items-end" : "items-start";
  const bubble = message.isFromMe
    ? "bg-sent text-sent-text rounded-2xl rounded-br-md"
    : "bg-received text-received-text rounded-2xl rounded-bl-md";

  if (message.isAnnouncement) {
    return (
      <div className="my-2 text-center text-[11px] text-muted">
        {message.body || "Announcement"}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${align}`}>
      {!message.isFromMe && (
        <span className="mb-0.5 px-1 text-[10px] text-muted">{message.senderName}</span>
      )}
      <div className={`max-w-[75%] px-3 py-2 text-[14px] leading-snug ${bubble}`}>
        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        {message.attachments.length > 0 && (
          <div className={`${message.body ? "mt-2" : ""} space-y-1`}>
            {message.attachments.map((a) =>
              a.assetsPath && a.mimeType?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={a.id}
                  src={`/api/assets/${a.assetsPath}`}
                  alt={a.originalName ?? "attachment"}
                  className="max-h-64 max-w-full rounded-lg"
                />
              ) : a.assetsPath ? (
                <a
                  key={a.id}
                  href={`/api/assets/${a.assetsPath}`}
                  className="block text-[12px] underline opacity-90"
                  target="_blank"
                  rel="noreferrer"
                >
                  {a.originalName ?? a.assetsPath}
                </a>
              ) : (
                <span key={a.id} className="block text-[12px] opacity-70">
                  {a.originalName ?? "Missing attachment"}
                </span>
              ),
            )}
          </div>
        )}
      </div>
      <span className="mt-0.5 px-1 text-[10px] text-muted">
        {message.timestamp.replace("T", " ").slice(0, 19)}
      </span>
    </div>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 py-2.5">
      <div className="pt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] tracking-wide text-muted">{label}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function PeopleGroupIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.75 19.25c.6-3.1 2.85-4.75 6.25-4.75s5.65 1.65 6.25 4.75" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M14.5 19.25c.35-1.85 1.55-3.1 3.5-3.55" />
    </svg>
  );
}

function StatusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 8v4.5l2.5 1.5" />
    </svg>
  );
}

function RangeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10.5h17" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.4 21 3 13.6 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.02l-2.2 2.19Z" />
    </svg>
  );
}
