"use client";

import type { GroupYearRow, MessageRow } from "@/lib/types";
import type { RefObject } from "react";
import { MessageBubble } from "./MessageBubble";

export function GroupChatsMessagesPane({
  messagesPaneRef,
  multiSelected,
  selectedIds,
  selectedRow,
  focusYear,
  loading,
  messages,
}: {
  messagesPaneRef: RefObject<HTMLElement | null>;
  multiSelected: boolean;
  selectedIds: Set<number>;
  selectedRow: GroupYearRow | null;
  focusYear: number | null;
  loading: boolean;
  messages: MessageRow[];
}) {
  return (
        <section
          ref={messagesPaneRef}
          className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4"
        >
          {multiSelected && (
            <p className="pt-8 text-center text-[13px] text-muted">
              {selectedIds.size} group
              {selectedIds.size === 1 ? "" : "s"} selected
            </p>
          )}
          {!multiSelected && !selectedRow && (
            <p className="pt-8 text-center text-[13px] text-muted">
              Select a group to read messages.
            </p>
          )}
          {!multiSelected && selectedRow && loading && messages.length === 0 && (
            <p className="pt-8 text-center text-[13px] text-muted">
              Loading messages…
            </p>
          )}
          {!multiSelected &&
            selectedRow &&
            !loading &&
            messages.length === 0 && (
              <p className="pt-8 text-center text-[13px] text-muted">
                No messages
              </p>
            )}
          {!multiSelected && selectedRow && messages.length > 0 && (
            <div
              className={`mx-auto flex max-w-2xl flex-col gap-2 ${
                loading ? "opacity-60" : ""
              }`}
            >
              <div className="mb-2 border-b border-border/60 pb-2 text-center">
                <div className="px-2 text-[13px] font-medium break-words text-text whitespace-normal">
                  {selectedRow.participantNames.length > 0
                    ? selectedRow.participantNames.join(" · ")
                    : selectedRow.title}
                </div>
                {selectedRow.namedTitle ? (
                  <div className="mt-0.5 text-[12px] text-muted">
                    {selectedRow.namedTitle}
                  </div>
                ) : null}
                <div className="mt-0.5 text-[12px] text-muted">
                  {selectedRow.spansMultipleYears
                    ? `${selectedRow.conversationDateStart} — ${selectedRow.conversationDateEnd}`
                    : selectedRow.dateStart === selectedRow.dateEnd
                      ? selectedRow.dateStart
                      : `${selectedRow.dateStart} — ${selectedRow.dateEnd}`}
                  {focusYear != null && selectedRow.spansMultipleYears ? (
                    <>
                      <span className="mx-1.5">·</span>
                      starting {focusYear}
                    </>
                  ) : null}
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
