"use client";

import { useCallback } from "react";

export type ContactEditDraft = {
  firstName: string;
  lastName: string;
  phones: string[];
  exclude: boolean;
};

export function seedContactEditDraft(contact: {
  firstName: string | null;
  lastName: string | null;
  phones: string[];
  exclude: boolean;
}): ContactEditDraft {
  return {
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    phones: [...contact.phones, ""],
    exclude: contact.exclude,
  };
}

/** Drop empty non-trailing rows; ensure exactly one trailing empty row. */
function normalizePhoneRows(phones: string[]): string[] {
  const filled = phones.filter((p, i) => {
    if (i === phones.length - 1) return true;
    return p.trim() !== "";
  });
  const withoutTrailingEmpties = [...filled];
  while (
    withoutTrailingEmpties.length > 1 &&
    withoutTrailingEmpties[withoutTrailingEmpties.length - 1] === "" &&
    withoutTrailingEmpties[withoutTrailingEmpties.length - 2] === ""
  ) {
    withoutTrailingEmpties.pop();
  }
  if (
    withoutTrailingEmpties.length === 0 ||
    withoutTrailingEmpties[withoutTrailingEmpties.length - 1] !== ""
  ) {
    withoutTrailingEmpties.push("");
  }
  return withoutTrailingEmpties;
}

export function ContactEditPane({
  draft,
  onChange,
}: {
  draft: ContactEditDraft;
  onChange: (next: ContactEditDraft) => void;
}) {
  const setField = useCallback(
    <K extends keyof ContactEditDraft>(key: K, value: ContactEditDraft[K]) => {
      onChange({ ...draft, [key]: value });
    },
    [draft, onChange],
  );

  const setPhoneAt = useCallback(
    (index: number, value: string) => {
      const next = [...draft.phones];
      next[index] = value;
      // Typing into the trailing empty box adds another empty row below.
      if (index === draft.phones.length - 1 && value !== "") {
        next.push("");
      }
      onChange({ ...draft, phones: next });
    },
    [draft, onChange],
  );

  const removePhoneAt = useCallback(
    (index: number) => {
      const next = draft.phones.filter((_, i) => i !== index);
      onChange({ ...draft, phones: normalizePhoneRows(next) });
    },
    [draft, onChange],
  );

  const blurPhoneAt = useCallback(
    (index: number) => {
      if (index >= draft.phones.length - 1) return;
      if (draft.phones[index]?.trim() !== "") return;
      onChange({ ...draft, phones: normalizePhoneRows(draft.phones) });
    },
    [draft, onChange],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-bg px-5 pt-8 pb-5">
      <div className="rounded-xl border border-border bg-[#2c2c2e] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            value={draft.firstName}
            onChange={(e) => setField("firstName", e.target.value)}
            placeholder="First name"
            className="rounded-lg border border-border bg-transparent px-3 py-2 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent/60"
          />
          <input
            type="text"
            value={draft.lastName}
            onChange={(e) => setField("lastName", e.target.value)}
            placeholder="Last name"
            className="rounded-lg border border-border bg-transparent px-3 py-2 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent/60"
          />
        </div>

        <div className="mt-5">
          <div className="mb-2 text-[12px] font-medium text-muted">Phone</div>
          <div className="flex flex-col gap-2">
            {draft.phones.map((phone, index) => {
              const showRemove = phone.trim() !== "";
              return (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhoneAt(index, e.target.value)}
                    onBlur={() => blurPhoneAt(index)}
                    placeholder="0123 456 789"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent/60"
                  />
                  {showRemove ? (
                    <button
                      type="button"
                      onClick={() => removePhoneAt(index)}
                      aria-label="Remove phone"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/10 hover:text-text"
                    >
                      <CloseIcon className="size-3.5" />
                    </button>
                  ) : (
                    <span className="size-7 shrink-0" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-accent">Excluded</span>
            <select
              value={draft.exclude ? "TRUE" : "FALSE"}
              onChange={(e) => setField("exclude", e.target.value === "TRUE")}
              className="max-w-xs rounded-lg border border-border bg-[#1c1c1e] px-3 py-2 text-[13px] text-text outline-none focus:border-accent/60"
            >
              <option value="FALSE">FALSE</option>
              <option value="TRUE">TRUE</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** Phones to persist: non-empty trimmed values, no trailing empty. */
export function phonesForSave(phones: string[]): string[] {
  return phones.map((p) => p.trim()).filter(Boolean);
}
