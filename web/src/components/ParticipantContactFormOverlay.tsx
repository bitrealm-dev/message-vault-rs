"use client";

import type { ContactEditDraft } from "./contactEdit";
import { ContactDetailsCard } from "./ContactDetailsCard";
import {
  ContactFormOverlay,
  type ContactFormAnchor,
} from "./ContactFormOverlay";
import { LabelsMenu, type LabelCheckState } from "./LabelsMenu";
import type { Dispatch, SetStateAction } from "react";

/** Props needed to render the shared participant contact form overlay. */
export type ParticipantContactFormView = {
  formOpen: boolean;
  editDraft: ContactEditDraft | null;
  setEditDraft: Dispatch<SetStateAction<ContactEditDraft | null>>;
  formAnchor: ContactFormAnchor | null;
  contactCreating: boolean;
  contactSaving: boolean;
  canSaveForm: boolean;
  draftMenuLabels: string[];
  draftLabelChecks: Record<string, LabelCheckState>;
  draftExcludedCheck: LabelCheckState;
  cancelContactForm: () => void;
  saveContactEdit: () => Promise<void>;
  saveContactCreate: () => Promise<void>;
  toggleDraftLabel: (name: string) => void;
  toggleDraftExcluded: () => void;
  createAndAssignDraftLabel: (name: string) => void;
  clearDraftLabels: () => void;
};

export function ParticipantContactFormOverlay({
  form,
  titleId,
  phonesView = [],
}: {
  form: ParticipantContactFormView;
  titleId: string;
  phonesView?: string[];
}) {
  const {
    formOpen,
    editDraft,
    setEditDraft,
    formAnchor,
    contactCreating,
    contactSaving,
    canSaveForm,
    draftMenuLabels,
    draftLabelChecks,
    draftExcludedCheck,
    cancelContactForm,
    saveContactCreate,
    saveContactEdit,
    toggleDraftLabel,
    toggleDraftExcluded,
    createAndAssignDraftLabel,
    clearDraftLabels,
  } = form;

  if (!formOpen || !editDraft) return null;

  return (
    <ContactFormOverlay
      anchor={formAnchor}
      titleId={titleId}
      title={contactCreating ? "Add new contact" : "Edit contact"}
      busy={contactSaving}
      onDismiss={cancelContactForm}
      footer={
        <>
          <button
            type="button"
            disabled={contactSaving}
            onClick={cancelContactForm}
            className="rounded-md bg-elevated px-3 py-1.5 text-[13px] text-text transition-colors hover:bg-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={contactSaving || (contactCreating && !canSaveForm)}
            onClick={() =>
              void (contactCreating ? saveContactCreate() : saveContactEdit())
            }
            className="rounded-md bg-accent/25 px-3 py-1.5 text-[13px] font-medium text-text transition-colors hover:bg-accent/35 disabled:opacity-50"
          >
            Save
          </button>
        </>
      }
    >
      <ContactDetailsCard
        formOpen
        framed={false}
        draft={editDraft}
        onDraftChange={setEditDraft}
        labels={editDraft.labels}
        excluded={editDraft.exclude}
        phonesView={phonesView}
        labelsEditor={
          <LabelsMenu
            labeled
            allLabels={draftMenuLabels}
            checks={draftLabelChecks}
            excludedCheck={draftExcludedCheck}
            disabled={contactSaving}
            onToggle={toggleDraftLabel}
            onToggleExcluded={toggleDraftExcluded}
            onCreate={createAndAssignDraftLabel}
            onClearAll={clearDraftLabels}
          />
        }
      />
    </ContactFormOverlay>
  );
}
