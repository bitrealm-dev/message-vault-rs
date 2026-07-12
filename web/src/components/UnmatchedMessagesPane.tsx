"use client";

import type { MessageRow } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";

export function UnmatchedMessagesPane({
  multiSelected,
  activeYear,
  loadingMessages,
  messages,
}: {
  multiSelected: boolean;
  activeYear: number | null;
  loadingMessages: boolean;
  messages: MessageRow[];
}) {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4">
      {multiSelected ? (
        <p className="pt-8 text-center text-[13px] text-muted">
          Select a single handle to read messages.
        </p>
      ) : (
        <>
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
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
