"use client";

import type { GroupYearRow, MessageRow } from "@/lib/types";
import type { RefObject } from "react";
import { MessageBubble } from "./MessageBubble";
import { MessageIcon, PaperclipIcon } from "./icons";

function groupMessageHeader(
  selectedRow: GroupYearRow,
  focusYear: number | null,
  opts: {
    prominent: boolean;
    showYearHint: boolean;
    messageCount: number;
    attachmentCount: number;
  },
) {
  const title =
    selectedRow.participantNames.length > 0
      ? selectedRow.participantNames.join(" · ")
      : selectedRow.title;
  const dateLabel = selectedRow.spansMultipleYears
    ? `${selectedRow.conversationDateStart} — ${selectedRow.conversationDateEnd}`
    : selectedRow.dateStart === selectedRow.dateEnd
      ? selectedRow.dateStart
      : `${selectedRow.dateStart} — ${selectedRow.dateEnd}`;

  return (
    <div
      className={`border-b border-border/60 text-center ${
        opts.prominent ? "mb-4 pb-4" : "mb-2 pb-3"
      }`}
    >
      <div
        className={`px-2 break-words text-text whitespace-normal ${
          opts.prominent
            ? "text-2xl font-semibold tracking-tight"
            : "text-[13px] font-medium"
        }`}
      >
        {title}
      </div>
      {selectedRow.namedTitle ? (
        <div
          className={`mt-1 text-muted ${
            opts.prominent ? "text-[14px]" : "text-[12px]"
          }`}
        >
          {selectedRow.namedTitle}
        </div>
      ) : null}
      <div
        className={`mt-1.5 text-muted tabular-nums ${
          opts.prominent ? "text-[14px]" : "text-[12px]"
        }`}
      >
        {dateLabel}
        {opts.showYearHint &&
        focusYear != null &&
        selectedRow.spansMultipleYears ? (
          <>
            <span className="mx-1.5">·</span>
            starting {focusYear}
          </>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1 tabular-nums">
          <MessageIcon className="size-3.5 shrink-0 opacity-80" />
          {opts.messageCount.toLocaleString()}
        </span>
        <span className="opacity-50">·</span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <PaperclipIcon className="size-3.5 shrink-0 opacity-80" />
          {opts.attachmentCount.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function GroupChatsMessagesPane({
  messagesPaneRef,
  multiSelected,
  selectedIds,
  selectedRow,
  focusYear,
  loading,
  messages,
  conversationSelected,
  /** Trash: single pane — larger title header, no year-bucket hint. */
  prominentHeader = false,
}: {
  messagesPaneRef: RefObject<HTMLElement | null>;
  multiSelected: boolean;
  selectedIds: Set<number>;
  selectedRow: GroupYearRow | null;
  focusYear: number | null;
  loading: boolean;
  messages: MessageRow[];
  /** True when a conversation id is focused (year may still be resolving). */
  conversationSelected: boolean;
  prominentHeader?: boolean;
}) {
  const showThread = !multiSelected && selectedRow != null;
  const attachmentCount = messages.reduce(
    (n, m) => n + m.attachments.length,
    0,
  );

  return (
    <section
      ref={messagesPaneRef}
      className="h-full min-h-0 overflow-y-auto bg-bg px-4 py-4"
    >
      {multiSelected && (
        <p className="pt-8 text-center text-[13px] text-muted">
          {selectedIds.size} group
          {selectedIds.size === 1 ? "" : "s"} selected
        </p>
      )}
      {!multiSelected && !conversationSelected && (
        <p className="pt-8 text-center text-[13px] text-muted">
          Select a group to read messages.
        </p>
      )}
      {!multiSelected &&
        conversationSelected &&
        !selectedRow &&
        focusYear == null &&
        !loading && (
          <p className="pt-8 text-center text-[13px] text-muted">
            Select a year to read messages.
          </p>
        )}
      {showThread && selectedRow && (
        <div
          className={`mx-auto flex max-w-2xl flex-col gap-2 ${
            loading ? "opacity-60" : ""
          }`}
        >
          {groupMessageHeader(selectedRow, focusYear, {
            prominent: prominentHeader,
            showYearHint: !prominentHeader,
            messageCount: selectedRow.messageCount,
            attachmentCount,
          })}
          {loading && messages.length === 0 && (
            <p className="pt-4 text-center text-[13px] text-muted">
              Loading messages…
            </p>
          )}
          {!loading && messages.length === 0 && (
            <p className="pt-4 text-center text-[13px] text-muted">No messages</p>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>
      )}
    </section>
  );
}
