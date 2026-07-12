"use client";

import type { MessageRow } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";

export function UnassignedMessagesPane({
  multiSelected,
  activeYear,
  loadingMessages,
  messages,
  activeYearMeta,
}: {
  multiSelected: boolean;
  activeYear: number | null;
  loadingMessages: boolean;
  messages: MessageRow[];
  activeYearMeta: {
    messageCount: number;
    dateStart: string;
    dateEnd: string;
  } | null;
}) {
  return (
    <section className="h-full min-h-0 overflow-y-auto bg-bg px-4 py-4">
      {multiSelected ? (
        <p className="pt-8 text-center text-[13px] text-muted">
          Select a number or email to read messages.
        </p>
      ) : (
        <>
          {!activeYear && (
            <p className="pt-8 text-center text-[13px] text-muted">
              Select a year to read messages.
            </p>
          )}
          {loadingMessages && activeYear && messages.length === 0 && (
            <p className="pt-8 text-center text-[13px] text-muted">Loading…</p>
          )}
          {activeYear != null &&
            activeYearMeta &&
            messages.length > 0 && (
              <div
                className={`mx-auto flex max-w-2xl flex-col gap-2 ${
                  loadingMessages ? "opacity-60" : ""
                }`}
              >
                <div className="mb-2 border-y border-border/60 py-2 text-center">
                  <div className="text-[13px] font-medium text-text">
                    {activeYear}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    {activeYearMeta.messageCount} msgs
                    <span className="mx-1.5">·</span>
                    {activeYearMeta.dateStart === activeYearMeta.dateEnd
                      ? activeYearMeta.dateStart
                      : `${activeYearMeta.dateStart} — ${activeYearMeta.dateEnd}`}
                  </div>
                </div>
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </div>
            )}
        </>
      )}
    </section>
  );
}
