"use client";

import type { ContactListItem, MessageRow } from "@/lib/types";
import { searchContacts } from "@/lib/contactSearch";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SortByMenu, type SortMode } from "./SortByMenu";
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
  initialContactId,
}: {
  section: string;
  sectionLabel: string;
  contacts: ContactListItem[];
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
  const { sidebarWidth, threadsPct, startSide, startThreads } =
    useResizablePanes(`browse-${section}`);

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
    <div className="flex h-full min-h-0">
      <aside
        className="flex shrink-0 flex-col bg-sidebar"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <h2 className="text-[13px] font-medium text-text">
            {sectionLabel}{" "}
            <span className="text-muted">
              ({query.trim() ? `${sorted.length}/` : ""}
              {contacts.length})
            </span>
          </h2>
          <SortByMenu sort={sort} onChange={setSort} />
        </div>
        <div className="border-b border-border px-3 py-2">
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
                <div className="sticky top-0 bg-sidebar/95 px-3 py-1 text-[11px] font-semibold text-muted backdrop-blur">
                  {letter}
                </div>
              )}
              {items.map((c) => {
                const active = c.id === contactId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectContact(c.id)}
                    className={`relative flex w-full flex-col border-b border-border/60 px-3 py-2 text-left ${
                      active ? "bg-elevated" : "hover:bg-elevated/50"
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-[#c8c8c8]"
                      />
                    )}
                    <span className="truncate text-[13px] text-text">{c.displayName}</span>
                    {c.preferredPhone && (
                      <span className="truncate text-[11px] text-muted">
                        {c.preferredPhone}
                      </span>
                    )}
                  </button>
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
        <section
          className="flex flex-col overflow-y-auto bg-panel px-5 py-4"
          style={{ height: `${threadsPct}%`, minHeight: 140 }}
        >
          {!contactId && (
            <p className="text-[13px] text-muted">Choose a contact</p>
          )}
          {contactId && loadingThreads && (
            <p className="text-[13px] text-muted">Loading…</p>
          )}
          {detail && !loadingThreads && (
            <>
              <h1 className="text-xl font-semibold tracking-tight text-text">
                {detail.displayName}
              </h1>
              {detail.preferredPhone && (
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
                  <PhoneIcon className="size-3.5 shrink-0 text-white" />
                  <span>{detail.preferredPhone}</span>
                </p>
              )}
              {detail.dateStart && detail.dateEnd && (
                <p className="mt-1 text-[13px] text-text/80">
                  <span className="text-muted">Message range</span>
                  <span className="mx-1.5 text-muted">·</span>
                  {detail.dateStart === detail.dateEnd
                    ? detail.dateStart
                    : `${detail.dateStart} — ${detail.dateEnd}`}
                </p>
              )}

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
