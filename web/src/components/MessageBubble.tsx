"use client";

import type { MessageRow } from "@/lib/types";
import { MessageAttachments } from "./MessageAttachments";
import { useDateTimeFormat } from "./useDateTimeFormat";

export function MessageBubble({ message }: { message: MessageRow }) {
  const { formatTime } = useDateTimeFormat();
  const align = message.isFromMe ? "items-end" : "items-start";
  const bubble = message.isFromMe
    ? "bg-sent text-sent-text rounded-2xl rounded-br-md"
    : "bg-received text-received-text rounded-2xl rounded-bl-md";

  if (message.isAnnouncement) {
    return (
      <div
        className="my-2 text-center text-[12px] text-muted"
        data-timestamp={message.timestamp}
      >
        {message.body || "Announcement"}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${align}`} data-timestamp={message.timestamp}>
      {!message.isFromMe && (
        <span className="mb-0.5 px-1 text-[12px] text-muted">
          {message.senderName}
        </span>
      )}
      <div className={`max-w-[75%] px-3 py-2 text-[14px] leading-snug ${bubble}`}>
        {message.body && (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}
        <MessageAttachments
          source={message.source}
          attachments={message.attachments}
          hasBody={Boolean(message.body)}
        />
      </div>
      <span className="mt-0.5 px-1 text-[12px] text-muted">
        {formatTime(message.timestamp)}
      </span>
    </div>
  );
}
