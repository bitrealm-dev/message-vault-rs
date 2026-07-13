"use client";

import type { MessageRow } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { ThreadMessagesHeader } from "./ThreadMessagesHeader";

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
    attachmentCount?: number;
  } | null;
}) {
  const isYearThread = activeThread?.startsWith("y-") ?? false;

  return (
    <section className="h-full min-h-0 overflow-y-auto bg-bg px-4 py-4">
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
          <ThreadMessagesHeader
            title={activeThreadMeta.title}
            messageCount={activeThreadMeta.messageCount}
            dateStart={activeThreadMeta.dateStart}
            dateEnd={activeThreadMeta.dateEnd}
            attachmentCount={
              isYearThread ? (activeThreadMeta.attachmentCount ?? 0) : undefined
            }
            largeTitle={isYearThread}
          />
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>
      )}
    </section>
  );
}
