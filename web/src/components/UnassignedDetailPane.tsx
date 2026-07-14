"use client";

import type { UnassignedHandle, YearThread } from "@/lib/types";
import { isEmailHandle } from "@/lib/handleKind";
import { ContactDetailsCard } from "./ContactDetailsCard";
import type { ContactEditDraft } from "./contactEdit";
import { MessageSourcePicker } from "./MessageSourcePicker";
import { YearThreadPicker } from "./YearThreadPicker";

export function UnassignedDetailPane({
  mode,
  multiSelected,
  selected,
  selectedItems,
  creating,
  createDraft,
  onDraftChange,
  sources,
  messageSources,
  sourceCounts,
  source,
  onSourceChange,
  yearly,
  activeYear,
  loadingThreads,
  onLoadYear,
  onClearSelection,
  onSelectHandle,
}: {
  mode: "unassigned" | "trash";
  multiSelected: boolean;
  selected: UnassignedHandle | null;
  selectedItems: UnassignedHandle[];
  creating: boolean;
  createDraft: ContactEditDraft | null;
  onDraftChange: (draft: ContactEditDraft) => void;
  sources: string[];
  messageSources: string[];
  sourceCounts: { all: number; bySource: Record<string, number> };
  source: string | null;
  onSourceChange: (id: string | null) => void;
  yearly: YearThread[];
  activeYear: number | null;
  loadingThreads: boolean;
  onLoadYear: (y: YearThread) => void;
  onClearSelection: () => void;
  onSelectHandle: (h: string) => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto bg-bg px-5 py-4">
      {multiSelected ? (
        <div className="rounded-xl border border-border bg-[#2c2c2e] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
            <h2 className="text-[14px] font-semibold text-text">
              {selectedItems.length} unassigned handle
              {selectedItems.length === 1 ? "" : "s"} selected
            </h2>
            <button
              type="button"
              onClick={onClearSelection}
              className="inline-flex items-center rounded-md bg-white/12 px-2.5 py-1 text-[12px] text-text transition-colors hover:bg-white/18"
            >
              Clear selection
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {selectedItems.map((h, i) => (
              <li
                key={h.handle}
                className={`flex items-center justify-between gap-4 px-4 py-2.5 ${
                  i < selectedItems.length - 1
                    ? "border-b border-border/60"
                    : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectHandle(h.handle)}
                  className="min-w-0 truncate text-left text-[13px] text-text hover:text-accent"
                >
                  {h.handle}
                </button>
                <span className="shrink-0 text-[12px] text-muted tabular-nums">
                  {h.messageCount} msgs
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : !selected ? (
        <p className="text-[13px] text-muted">
          {mode === "trash"
            ? "Choose a trashed contact or number to read messages, or right-click a row for Undelete / Delete forever."
            : "Choose an unassigned number or email to create a contact or add the handle to someone existing."}
        </p>
      ) : (
        <>
          {creating && isEmailHandle(selected.handle) && (
            <p className="mb-3 text-[12px] text-muted">
              Add a phone number to save.{" "}
              <span className="text-text">{selected.handle}</span> will be
              linked on the contact in the database only (not written to
              contacts.csv).
            </p>
          )}
          <ContactDetailsCard
            formOpen={creating}
            draft={createDraft}
            onDraftChange={onDraftChange}
            groups={createDraft?.contactGroups ?? []}
            excluded={Boolean(createDraft?.exclude)}
            phonesView={[selected.handle]}
          />

          {!creating && (
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
                activeYear={activeYear}
                onSelect={onLoadYear}
                emptyLabel="No messages for this source"
                loading={loadingThreads}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
