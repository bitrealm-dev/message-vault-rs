"use client";

import type { UnassignedHandle, YearThread } from "@/lib/types";
import { ContactDetailsCard } from "./ContactDetailsCard";
import type { ContactEditDraft } from "./contactEdit";
import { MessageSourcePicker } from "./MessageSourcePicker";
import { YearThreadPicker } from "./YearThreadPicker";

export function UnassignedDetailPane({
  threadsPct,
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
  threadsPct: number;
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
    <section
      className="flex flex-col overflow-y-auto bg-panel px-5 py-4"
      style={{ height: `${threadsPct}%`, minHeight: 140 }}
    >
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
                  {h.displayName}
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
            ? "Choose a trashed number or email to read messages, or use Undelete / Delete permanently from the menu."
            : "Choose an unassigned number or email to create a contact or add the handle to someone existing."}
        </p>
      ) : (
        <>
          <ContactDetailsCard
            formOpen={creating}
            draft={createDraft}
            onDraftChange={onDraftChange}
            tags={creating ? (createDraft?.tags ?? []) : []}
            excluded={creating ? Boolean(createDraft?.exclude) : false}
            phonesView={[selected.handle]}
          />

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
        </>
      )}
    </section>
  );
}
