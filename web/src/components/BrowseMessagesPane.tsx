"use client";

import type { MessageRow } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";

export function BrowseMessagesPane({
  activeThread,
  loadingMessages,
  messages,
  activeThreadMeta,
}: {
  activeThread: string | null;
  loadingMessages: boolean;
  messages: MessageRow[];
  activeThreadMeta: {
    title: string;
    messageCount: number;
    dateStart: string;
    dateEnd: string;
  } | null;
}) {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4">
      {!activeThread && (
        <p className="pt-8 text-center text-[13px] text-muted">
          Select a year or group thread to read messages.
        </p>
      )}
      {loadingMessages && messages.length === 0 && (
        <p className="pt-8 text-center text-[13px] text-muted">
          Loading messages…
        </p>
      )}
      {activeThreadMeta && messages.length > 0 && (
        <div
          className={`mx-auto flex max-w-2xl flex-col gap-2 ${
            loadingMessages ? "opacity-60" : ""
          }`}
        >
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
  );
}
