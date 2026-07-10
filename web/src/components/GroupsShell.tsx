"use client";

import type { GroupListItem, MessageRow } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useResizablePanes } from "./useResizablePanes";

type YearThread = {
  year: number;
  messageCount: number;
  dateStart: string;
  dateEnd: string;
  conversationId: number;
};

export function GroupsShell({
  groups,
  initialGroupId,
}: {
  groups: GroupListItem[];
  initialGroupId: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [groupId, setGroupId] = useState<number | null>(initialGroupId);
  const [years, setYears] = useState<YearThread[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { sidebarWidth, threadsPct, startSide, startThreads } =
    useResizablePanes("browse-groups");

  const selected = groups.find((g) => g.id === groupId) ?? null;

  const selectGroup = useCallback(
    (id: number) => {
      setGroupId(id);
      setMessages([]);
      setActiveYear(null);
      const params = new URLSearchParams(searchParams.toString());
      params.set("g", String(id));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!groupId) {
      setYears([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/groups/${groupId}/threads`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setYears(data.yearly ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const loadYear = (year: number, conversationId: number) => {
    setActiveYear(year);
    setLoading(true);
    fetch(`/api/messages?conversationId=${conversationId}&year=${year}`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages ?? []))
      .finally(() => setLoading(false));
  };

  return (
    <div className="flex h-full min-h-0">
      <aside
        className="flex shrink-0 flex-col bg-sidebar"
        style={{ width: sidebarWidth }}
      >
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="text-[13px] font-medium text-text">
            Groups <span className="text-muted">({groups.length})</span>
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.map((g) => {
            const active = g.id === groupId;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => selectGroup(g.id)}
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
                <span className="truncate text-[13px] text-text">{g.title}</span>
                <span className="text-[11px] text-muted">
                  {g.messageCount} messages
                  {g.dateStart ? ` · ${g.dateStart}` : ""}
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

      <div id="browse-groups-right" className="flex min-w-0 flex-1 flex-col">
        <section
          className="flex flex-col overflow-y-auto bg-panel px-5 py-4"
          style={{ height: `${threadsPct}%`, minHeight: 140 }}
        >
          {!selected && <p className="text-[13px] text-muted">Choose a group</p>}
          {selected && (
            <>
              <h1 className="text-xl font-semibold text-text">{selected.title}</h1>
              {selected.dateStart && selected.dateEnd && (
                <p className="mt-1 text-[13px] text-muted">
                  {selected.dateStart} — {selected.dateEnd}
                </p>
              )}
              <h3 className="mt-5 text-[11px] font-semibold tracking-wider text-muted uppercase">
                Yearly messages
              </h3>
              <div className="mt-2 flex flex-wrap gap-3">
                {years.map((y) => (
                  <button
                    key={y.year}
                    type="button"
                    onClick={() => loadYear(y.year, y.conversationId)}
                    className={`text-[13px] ${
                      activeYear === y.year ? "text-accent" : "text-text hover:text-accent"
                    }`}
                  >
                    <span className="font-medium">{y.year}</span>
                    <span className="ml-2 text-muted">{y.messageCount}</span>
                  </button>
                ))}
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
          {!activeYear && (
            <p className="pt-8 text-center text-[13px] text-muted">
              Select a year to read messages.
            </p>
          )}
          {loading && activeYear && (
            <p className="pt-8 text-center text-[13px] text-muted">Loading…</p>
          )}
          {!loading && messages.length > 0 && (
            <div className="mx-auto flex max-w-2xl flex-col gap-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.isFromMe ? "items-end" : "items-start"}`}
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
                    {m.attachments.map((a) =>
                      a.assetsPath && a.mimeType?.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={a.id}
                          src={`/api/assets/${a.assetsPath}`}
                          alt={a.originalName ?? ""}
                          className="mt-1 max-h-64 max-w-full rounded-lg"
                        />
                      ) : a.assetsPath ? (
                        <a
                          key={a.id}
                          href={`/api/assets/${a.assetsPath}`}
                          className="mt-1 block text-[12px] underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {a.originalName ?? "attachment"}
                        </a>
                      ) : null,
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
