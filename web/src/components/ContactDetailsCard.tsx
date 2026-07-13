"use client";

import {
  ContactPhoneList,
  displayGroupNames,
  type ContactEditDraft,
} from "./contactEdit";
import {
  PeopleGroupIcon,
  PersonDetailIcon,
  PhoneIcon,
} from "./icons";

export function ContactDetailsCard({
  formOpen,
  draft,
  onDraftChange,
  groups,
  excluded,
  phonesView,
}: {
  formOpen: boolean;
  draft: ContactEditDraft | null;
  onDraftChange?: (draft: ContactEditDraft) => void;
  groups: string[];
  excluded: boolean;
  /** Phones shown in view mode (when form is closed). */
  phonesView: string[];
}) {
  const shownGroups = displayGroupNames(groups, excluded);
  const phoneCount =
    formOpen && draft
      ? draft.phones.filter((p) => p.trim()).length
      : phonesView.length;
  const phoneLabel = phoneCount === 1 ? "Phone" : "Phones";

  return (
    <div className="rounded-xl border border-border bg-[#2c2c2e] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
      <h2 className="text-[13px] font-semibold text-text">Contact details</h2>
      <div className="mt-3">
        {formOpen && draft && onDraftChange && (
          <div className="mb-3 flex gap-3">
            <div className="pt-0.5">
              <PersonDetailIcon className="size-5 shrink-0 text-muted" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] tracking-wide text-muted">Name</div>
              <div className="mt-0.5 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={draft.firstName}
                  onChange={(e) =>
                    onDraftChange({ ...draft, firstName: e.target.value })
                  }
                  placeholder="First"
                  className="rounded-md border border-border bg-transparent px-2 py-1 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent/60"
                />
                <input
                  type="text"
                  value={draft.lastName}
                  onChange={(e) =>
                    onDraftChange({ ...draft, lastName: e.target.value })
                  }
                  placeholder="Last"
                  className="rounded-md border border-border bg-transparent px-2 py-1 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent/60"
                />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="pt-0.5">
              <PeopleGroupIcon className="size-5 shrink-0 text-muted" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] tracking-wide text-muted">Groups</div>
              <div className="mt-0.5">
                {shownGroups.length === 0 ? (
                  <span className="text-[13px] text-muted">None</span>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {shownGroups.map((name) => (
                      <span
                        key={name}
                        className={
                          name === "Excluded"
                            ? "truncate text-[13px] font-semibold text-amber-400/90"
                            : "truncate text-[13px] text-text"
                        }
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 gap-3">
            <div className="pt-0.5">
              <PhoneIcon className="size-5 shrink-0 text-muted" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] tracking-wide text-muted">
                {phoneLabel}
              </div>
              <div className="mt-0.5">
                {formOpen && draft && onDraftChange ? (
                  <ContactPhoneList
                    phones={draft.phones}
                    onChange={(phones) => onDraftChange({ ...draft, phones })}
                  />
                ) : phonesView.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {phonesView.map((phone) => (
                      <span
                        key={phone}
                        className="truncate text-[13px] text-text"
                      >
                        {phone}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[13px] text-muted">None</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
