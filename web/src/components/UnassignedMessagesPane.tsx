"use client";

import type { MessageRow } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { ThreadMessagesHeader } from "./ThreadMessagesHeader";

export function UnassignedMessagesPane({
  multiSelected,
  activeYear,
  loadingMessages,
  messages,
  activeYearMeta,
  emptyHint = "Select a year to read messages.",
}: {
  multiSelected: boolean;
  activeYear: number | null;
  loadingMessages: boolean;
  messages: MessageRow[];
  activeYearMeta: {
    messageCount: number;
    dateStart: string;
    dateEnd: string;
    attachmentCount?: number;
  } | null;
  /** Shown when no year is selected (omit / empty to hide). */
  emptyHint?: string | null;
}) {
  return (
    <section className="h-full min-h-0 overflow-y-auto bg-bg px-4 py-4">
      {multiSelected ? (
        <p className="pt-8 text-center text-[13px] text-muted">
          Select a number or email to read messages.
        </p>
      ) : (
        <>
          {!activeYear && emptyHint ? (
            <p className="pt-8 text-center text-[13px] text-muted">{emptyHint}</p>
          ) : null}
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
                <ThreadMessagesHeader
                  title={String(activeYear)}
                  messageCount={activeYearMeta.messageCount}
                  dateStart={activeYearMeta.dateStart}
                  dateEnd={activeYearMeta.dateEnd}
                  attachmentCount={activeYearMeta.attachmentCount ?? 0}
                  largeTitle
                />
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
