"use client";

import type { GroupParticipant } from "@/lib/types";
import { phoneHandlesOnly } from "@/lib/handleKind";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  draftHasName,
  emptyContactEditDraft,
  phonesForSave,
  seedContactEditDraft,
  type ContactEditDraft,
} from "./contactEdit";
import {
  contactFormAnchorFromRect,
  type ContactFormAnchor,
} from "./ContactFormOverlay";
import type { GroupCheckState } from "./GroupsMenu";

export type UseParticipantContactFormOptions = {
  vaultReadOnly: boolean;
  setStatus?: (message: string | null) => void;
  /** Extra group names always listed in the draft Groups menu (e.g. browse allGroups). */
  knownGroups?: string[];
  /** Defaults applied when creating a contact from a handle. */
  createDefaults?: { contactGroups: string[]; exclude: boolean };
  /** Return true to ignore Escape (e.g. another modal is open). */
  shouldIgnoreEscape?: () => boolean;
  /** After successful create/edit (default: router.refresh). */
  onSaved?: () => void;
};

export type ParticipantContactFormState = {
  formOpen: boolean;
  editDraft: ContactEditDraft | null;
  setEditDraft: Dispatch<SetStateAction<ContactEditDraft | null>>;
  formAnchor: ContactFormAnchor | null;
  contactCreating: boolean;
  editContactId: number | null;
  contactSaving: boolean;
  canSaveForm: boolean;
  draftMenuGroups: string[];
  draftGroupChecks: Record<string, GroupCheckState>;
  draftExcludedCheck: GroupCheckState;
  cancelContactForm: () => void;
  saveContactEdit: () => Promise<void>;
  saveContactCreate: () => Promise<void>;
  toggleDraftGroup: (name: string) => void;
  toggleDraftExcluded: () => void;
  createAndAssignDraftGroup: (name: string) => void;
  clearDraftGroups: () => void;
  openEditContact: (id: number, anchor: ContactFormAnchor) => Promise<void>;
  openCreateContactWithHandle: (
    handle: string,
    anchor: ContactFormAnchor,
  ) => void;
  onParticipantClick: (
    participant: GroupParticipant,
    anchorRect: DOMRect,
  ) => void;
};

export function useParticipantContactForm(
  options: UseParticipantContactFormOptions,
): ParticipantContactFormState {
  const {
    vaultReadOnly,
    setStatus,
    knownGroups = [],
    createDefaults,
    shouldIgnoreEscape,
    onSaved,
  } = options;

  const router = useRouter();
  const [editContactId, setEditContactId] = useState<number | null>(null);
  const [contactCreating, setContactCreating] = useState(false);
  const [editDraft, setEditDraft] = useState<ContactEditDraft | null>(null);
  const [formAnchor, setFormAnchor] = useState<ContactFormAnchor | null>(null);
  const [extraDraftGroups, setExtraDraftGroups] = useState<string[]>([]);
  const [contactSaving, setContactSaving] = useState(false);

  const formOpen = (editContactId != null || contactCreating) && !!editDraft;
  const canSaveForm =
    !!editDraft &&
    draftHasName(editDraft) &&
    phoneHandlesOnly(phonesForSave(editDraft.phones)).length > 0;

  const draftMenuGroups = useMemo(() => {
    const names = new Set([...knownGroups, ...extraDraftGroups]);
    for (const g of editDraft?.contactGroups ?? []) names.add(g);
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [knownGroups, extraDraftGroups, editDraft?.contactGroups]);

  const draftGroupChecks = useMemo(() => {
    const result: Record<string, GroupCheckState> = {};
    const groups = editDraft?.contactGroups ?? [];
    for (const name of draftMenuGroups) {
      result[name] = groups.includes(name) ? "on" : "off";
    }
    return result;
  }, [draftMenuGroups, editDraft?.contactGroups]);

  const draftExcludedCheck = useMemo((): GroupCheckState => {
    return editDraft?.exclude ? "on" : "off";
  }, [editDraft?.exclude]);

  const cancelContactForm = useCallback(() => {
    setEditContactId(null);
    setContactCreating(false);
    setEditDraft(null);
    setFormAnchor(null);
    setExtraDraftGroups([]);
  }, []);

  useEffect(() => {
    if (!formOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (shouldIgnoreEscape?.()) return;
      e.preventDefault();
      if (!contactSaving) cancelContactForm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [formOpen, contactSaving, cancelContactForm, shouldIgnoreEscape]);

  const toggleDraftGroup = useCallback((name: string) => {
    setEditDraft((prev) => {
      if (!prev) return prev;
      const has = prev.contactGroups.includes(name);
      const contactGroups = has
        ? prev.contactGroups.filter((g) => g !== name)
        : [...prev.contactGroups, name].sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: "base" }),
          );
      return { ...prev, contactGroups };
    });
  }, []);

  const createAndAssignDraftGroup = useCallback((name: string) => {
    setExtraDraftGroups((prev) =>
      prev.includes(name) ? prev : [...prev, name],
    );
    setEditDraft((prev) => {
      if (!prev) return prev;
      if (prev.contactGroups.includes(name)) return prev;
      return {
        ...prev,
        contactGroups: [...prev.contactGroups, name].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        ),
      };
    });
  }, []);

  const toggleDraftExcluded = useCallback(() => {
    setEditDraft((prev) =>
      prev ? { ...prev, exclude: !prev.exclude } : prev,
    );
  }, []);

  const clearDraftGroups = useCallback(() => {
    setEditDraft((prev) =>
      prev ? { ...prev, contactGroups: [], exclude: false } : prev,
    );
  }, []);

  const finishSaved = useCallback(() => {
    cancelContactForm();
    if (onSaved) onSaved();
    else router.refresh();
  }, [cancelContactForm, onSaved, router]);

  const openEditContact = useCallback(
    async (id: number, anchor: ContactFormAnchor) => {
      setFormAnchor(anchor);
      setContactSaving(true);
      try {
        const res = await fetch(`/api/contacts/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "load failed");
        setExtraDraftGroups([]);
        setEditDraft(seedContactEditDraft(data.contact));
        setEditContactId(id);
        setContactCreating(false);
      } catch (err) {
        console.error(err);
        setFormAnchor(null);
        setStatus?.(
          err instanceof Error ? err.message : "Failed to load contact",
        );
      } finally {
        setContactSaving(false);
      }
    },
    [setStatus],
  );

  const openCreateContactWithHandle = useCallback(
    (handle: string, anchor: ContactFormAnchor) => {
      setFormAnchor(anchor);
      setExtraDraftGroups([]);
      setEditContactId(null);
      setContactCreating(true);
      const draft = emptyContactEditDraft(createDefaults);
      setEditDraft({ ...draft, phones: [handle, ""] });
    },
    [createDefaults],
  );

  const onParticipantClick = useCallback(
    (participant: GroupParticipant, anchorRect: DOMRect) => {
      if (vaultReadOnly || contactSaving || formOpen) return;
      const anchor = contactFormAnchorFromRect(anchorRect);
      if (participant.contactId != null) {
        void openEditContact(participant.contactId, anchor);
        return;
      }
      openCreateContactWithHandle(participant.handle, anchor);
    },
    [
      vaultReadOnly,
      contactSaving,
      formOpen,
      openEditContact,
      openCreateContactWithHandle,
    ],
  );

  const saveContactEdit = useCallback(async () => {
    if (!editDraft || editContactId == null) return;
    setContactSaving(true);
    try {
      const res = await fetch(`/api/contacts/${editContactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editDraft.firstName.trim() || null,
          lastName: editDraft.lastName.trim() || null,
          phones: phonesForSave(editDraft.phones),
          exclude: editDraft.exclude,
          contactGroups: editDraft.contactGroups,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      finishSaved();
    } catch (err) {
      console.error(err);
      setStatus?.(err instanceof Error ? err.message : "Save failed");
    } finally {
      setContactSaving(false);
    }
  }, [editDraft, editContactId, finishSaved, setStatus]);

  const saveContactCreate = useCallback(async () => {
    if (!editDraft || !draftHasName(editDraft)) return;
    setContactSaving(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editDraft.firstName.trim() || null,
          lastName: editDraft.lastName.trim() || null,
          phones: phonesForSave(editDraft.phones),
          exclude: editDraft.exclude,
          contactGroups: editDraft.contactGroups,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");
      finishSaved();
    } catch (err) {
      console.error(err);
      setStatus?.(err instanceof Error ? err.message : "Create failed");
    } finally {
      setContactSaving(false);
    }
  }, [editDraft, finishSaved, setStatus]);

  return {
    formOpen,
    editDraft,
    setEditDraft,
    formAnchor,
    contactCreating,
    editContactId,
    contactSaving,
    canSaveForm,
    draftMenuGroups,
    draftGroupChecks,
    draftExcludedCheck,
    cancelContactForm,
    saveContactEdit,
    saveContactCreate,
    toggleDraftGroup,
    toggleDraftExcluded,
    createAndAssignDraftGroup,
    clearDraftGroups,
    openEditContact,
    openCreateContactWithHandle,
    onParticipantClick,
  };
}
