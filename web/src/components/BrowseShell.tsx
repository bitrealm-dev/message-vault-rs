"use client";

import type { ContactListItem, MessageRow } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SortByMenu, type SortMode } from "./SortByMenu";
import { useResizablePanes } from "./useResizablePanes";

type YearThread = {
  year: number;
  messageCount: number;
  dateStart: string;
  dateEnd: string;
  conversationId: number;
};

type GroupThread = {
  conversationId: number;
  title: string;
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
  }, [contacts, sort]);

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

  const loadMessages = useCallback((conversationId: number, year: number, key: string) => {
    setActiveThread(key);
    setLoadingMessages(true);
    fetch(`/api/messages?conversationId=${conversationId}&year=${year}`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages ?? []))
      .finally(() => setLoadingMessages(false));
  }, []);

  const groupsByYear = useMemo(() => {
    const map = new Map<number, GroupThread[]>();
    for (const g of groups) {
      if (!map.has(g.year)) map.set(g.year, []);
      map.get(g.year)!.push(g);
    }
    return [...map.entries()].sort(([a], [b]) => b - a);
  }, [groups]);

  return (
    <div className="flex h-full min-h-0">
      <aside
        className="flex shrink-0 flex-col bg-sidebar"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <h2 className="text-[13px] font-medium text-text">
            {sectionLabel}{" "}
            <span className="text-muted">({contacts.length})</span>
          </h2>
          <SortByMenu sort={sort} onChange={setSort} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {grouped.map(([letter, items]) => (
            <div key={letter}>
              <div className="sticky top-0 bg-sidebar/95 px-3 py-1 text-[11px] font-semibold text-muted backdrop-blur">
                {letter}
              </div>
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
                <p className="mt-0.5 text-[13px] text-muted">{detail.preferredPhone}</p>
              )}
              {detail.dateStart && detail.dateEnd && (
                <p className="mt-1 text-[13px] text-text/80">
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
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                    {yearly.map((y) => {
                      const key = `y-${y.conversationId}-${y.year}`;
                      const active = activeThread === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => loadMessages(y.conversationId, y.year, key)}
                          className={`text-left text-[13px] ${
                            active ? "text-accent" : "text-text hover:text-accent"
                          }`}
                        >
                          <span className="font-medium">{y.year}</span>
                          <span className="ml-2 text-muted">
                            {y.dateStart}
                            {y.dateEnd !== y.dateStart ? ` — ${y.dateEnd}` : ""}
                          </span>
                        </button>
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
                  <div className="mt-2 space-y-3">
                    {groupsByYear.map(([year, items]) => (
                      <div key={year} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span className="w-10 shrink-0 text-[13px] font-medium text-text">
                          {year}
                        </span>
                        {items.map((g) => {
                          const key = `g-${g.conversationId}-${g.year}`;
                          const active = activeThread === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() =>
                                loadMessages(g.conversationId, g.year, key)
                              }
                              className={`flex min-w-0 flex-1 basis-48 items-baseline justify-between gap-3 text-left text-[13px] ${
                                active ? "text-accent" : "text-text hover:text-accent"
                              }`}
                            >
                              <span className="truncate">{g.title}</span>
                              <span className="shrink-0 text-[11px] text-muted">
                                {g.dateStart}
                                {g.dateEnd !== g.dateStart ? ` — ${g.dateEnd}` : ""}
                              </span>
                            </button>
                          );
                        })}
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
          {!loadingMessages && messages.length > 0 && (
            <div className="mx-auto flex max-w-2xl flex-col gap-2">
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
