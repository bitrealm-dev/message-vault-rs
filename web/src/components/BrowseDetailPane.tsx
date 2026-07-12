"use client";

import type {
  ContactDetail,
  GroupThread,
  YearThread,
} from "@/lib/types";
import {
  groupDateMeta,
  type GroupDateFormat,
} from "@/lib/groupDateFormat";
import { ContactDetailsCard } from "./ContactDetailsCard";
import type { ContactEditDraft } from "./contactEdit";
import { MessageSourcePicker } from "./MessageSourcePicker";
import { YearThreadPicker } from "./YearThreadPicker";

export function BrowseDetailPane({
  threadsPct,
  detail,
  contactId,
  contactCreating,
  formOpen,
  editDraft,
  onDraftChange,
  tagsFor,
  excludeOverrides,
  sources,
  messageSources,
  sourceCounts,
  source,
  onSourceChange,
  yearly,
  activeThread,
  onLoadYear,
  groupsByYear,
  groupDateFormat,
  onGroupDateFormatChange,
  onLoadGroupThread,
}: {
  threadsPct: number;
  detail: ContactDetail | null;
  contactId: number | null;
  contactCreating: boolean;
  formOpen: boolean;
  editDraft: ContactEditDraft | null;
  onDraftChange: (draft: ContactEditDraft) => void;
  tagsFor: (id: number, base: string[]) => string[];
  excludeOverrides: Map<number, boolean>;
  sources: string[];
  messageSources: string[];
  sourceCounts: { all: number; bySource: Record<string, number> };
  source: string | null;
  onSourceChange: (id: string | null) => void;
  yearly: YearThread[];
  activeThread: string | null;
  onLoadYear: (y: YearThread) => void;
  groupsByYear: [number, GroupThread[]][];
  groupDateFormat: GroupDateFormat;
  onGroupDateFormatChange: (next: GroupDateFormat) => void;
  onLoadGroupThread: (
    conversationIds: number[],
    year: number,
    key: string,
  ) => void;
}) {
  return (
    <section
      className="min-h-0 flex flex-col overflow-y-auto bg-bg px-5 py-4"
      style={{ height: `${threadsPct}%` }}
    >
      {((detail && contactId) || (contactCreating && editDraft)) && (
        <>
          <ContactDetailsCard
            formOpen={formOpen}
            draft={editDraft}
            onDraftChange={onDraftChange}
            tags={
              contactCreating && editDraft
                ? editDraft.tags
                : detail
                  ? tagsFor(detail.id, detail.tags)
                  : []
            }
            excluded={
              contactCreating && editDraft
                ? editDraft.exclude
                : detail
                  ? (excludeOverrides.get(detail.id) ?? detail.exclude)
                  : false
            }
            phonesView={detail?.phones ?? []}
          />

          {!contactCreating && (
            <div className="mt-4 rounded-xl border border-border bg-[#2c2c2e] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
              <MessageSourcePicker
                sources={sources}
                messageSources={messageSources}
                sourceCounts={sourceCounts}
                source={source}
                onSourceChange={onSourceChange}
              />
              <YearThreadPicker
                years={yearly}
                activeYear={
                  activeThread?.startsWith("y-")
                    ? Number(activeThread.slice(2))
                    : null
                }
                onSelect={onLoadYear}
                emptyLabel="No individual messages"
              />

              <div className="mt-5">
                <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Group chats
                </h3>
                {groupsByYear.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted">No group chats</p>
                ) : (
                  <div className="mt-3 space-y-12">
                    {groupsByYear.map(([year, items], yearIdx) => (
                      <div key={year}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="text-[13px] font-semibold text-text">
                            {year}
                          </div>
                          {yearIdx === 0 && (
                            <label className="flex items-center gap-1.5 text-[11px] text-muted">
                              <span className="sr-only">Date format</span>
                              <select
                                value={groupDateFormat}
                                onChange={(e) =>
                                  onGroupDateFormatChange(
                                    e.target.value as GroupDateFormat,
                                  )
                                }
                                className="rounded border border-border bg-elevated px-1.5 py-0.5 text-[11px] text-text outline-none"
                              >
                                <option value="md">01-31</option>
                                <option value="mon-d">Jan 31</option>
                                <option value="d-mon">31 Jan</option>
                              </select>
                            </label>
                          )}
                        </div>
                        <ul className="divide-y divide-border/50 border-y border-border/50">
                          {items.map((g) => {
                            const convIds = g.conversationIds?.length
                              ? g.conversationIds
                              : [g.conversationId];
                            const key = `g-${convIds.join("-")}-${g.year}`;
                            const active = activeThread === key;
                            return (
                              <li key={key}>
                                <button
                                  type="button"
                                  title={g.titleFull}
                                  onClick={() =>
                                    onLoadGroupThread(convIds, g.year, key)
                                  }
                                  className={`flex w-full items-start justify-between gap-4 rounded-md px-2 py-2 text-left text-[13px] ${
                                    active
                                      ? "bg-white/12 text-accent"
                                      : "text-text hover:bg-white/20 hover:text-accent"
                                  }`}
                                >
                                  <span className="min-w-0">
                                    <span className="line-clamp-2 font-medium leading-snug">
                                      {g.title}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                                      {g.participantCount} people
                                      <span className="mx-1.5">·</span>
                                      {g.messageCount} msgs
                                    </span>
                                  </span>
                                  <span className="shrink-0 pt-0.5 text-[11px] text-muted tabular-nums">
                                    {groupDateMeta(g, groupDateFormat)}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
