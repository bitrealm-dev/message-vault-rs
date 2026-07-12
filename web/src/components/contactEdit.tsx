"use client";

export type ContactEditDraft = {
  firstName: string;
  lastName: string;
  phones: string[];
  exclude: boolean;
  groups: string[];
};

export function seedContactEditDraft(contact: {
  firstName: string | null;
  lastName: string | null;
  phones: string[];
  exclude: boolean;
  groups?: string[];
}): ContactEditDraft {
  return {
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    phones: [...contact.phones, ""],
    exclude: contact.exclude,
    groups: contact.groups ? [...contact.groups] : [],
  };
}

export function emptyContactEditDraft(defaults?: {
  exclude?: boolean;
  groups?: string[];
}): ContactEditDraft {
  return {
    firstName: "",
    lastName: "",
    phones: [""],
    exclude: defaults?.exclude ?? false,
    groups: defaults?.groups ? [...defaults.groups] : [],
  };
}

export function draftHasName(draft: ContactEditDraft): boolean {
  return draft.firstName.trim() !== "" || draft.lastName.trim() !== "";
}

/** Groups list for the contact card: Excluded first when set. */
export function displayGroupNames(
  groups: string[],
  excluded: boolean,
): string[] {
  const rest = groups.filter((g) => g.toLowerCase() !== "excluded");
  return excluded ? ["Excluded", ...rest] : rest;
}

/** Drop empty non-trailing rows; ensure exactly one trailing empty row. */
export function normalizePhoneRows(phones: string[]): string[] {
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

export function updatePhoneAt(
  phones: string[],
  index: number,
  value: string,
): string[] {
  const next = [...phones];
  next[index] = value;
  if (index === phones.length - 1 && value !== "") {
    next.push("");
  }
  return next;
}

export function removePhoneAt(phones: string[], index: number): string[] {
  return normalizePhoneRows(phones.filter((_, i) => i !== index));
}

export function blurPhoneAt(phones: string[], index: number): string[] {
  if (index >= phones.length - 1) return phones;
  if (phones[index]?.trim() !== "") return phones;
  return normalizePhoneRows(phones);
}

/** Phones to persist: non-empty trimmed values, no trailing empty. */
export function phonesForSave(phones: string[]): string[] {
  return phones.map((p) => p.trim()).filter(Boolean);
}

export function ContactPhoneList({
  phones,
  onChange,
}: {
  phones: string[];
  onChange: (phones: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {phones.map((phone, index) => {
        const showRemove = phone.trim() !== "";
        return (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={phone}
              onChange={(e) =>
                onChange(updatePhoneAt(phones, index, e.target.value))
              }
              onBlur={() => onChange(blurPhoneAt(phones, index))}
              placeholder="0123 456 789"
              className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
            {showRemove ? (
              <button
                type="button"
                onClick={() => onChange(removePhoneAt(phones, index))}
                aria-label="Remove phone"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-white/10 hover:text-text"
              >
                <CloseIcon className="size-3.5" />
              </button>
            ) : (
              <span className="size-6 shrink-0" aria-hidden />
            )}
          </div>
        );
      })}
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
