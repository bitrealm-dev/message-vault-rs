"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EllipsisIcon } from "./icons";
import { useConfirmDialog } from "./useConfirmDialog";
import { useDismissible } from "./useDismissible";

type AccountEmail = {
  email: string;
  isPrimary: boolean;
};

type AccountData = {
  username: string;
  primaryEmail: string;
  emails: AccountEmail[];
  readOnly: boolean;
  isDemo: boolean;
  vaultOwner: {
    firstName: string;
    lastName: string;
    displayName: string;
    phones: string[];
  };
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function SettingsAccountForm() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [data, setData] = useState<AccountData | null>(null);
  const [username, setUsername] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [emails, setEmails] = useState<AccountEmail[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const applyAccount = (json: AccountData) => {
    setData(json);
    setUsername(json.username);
    setPrimaryEmail(json.primaryEmail);
    setEmails(json.emails);
    setReadOnly(json.readOnly);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/account");
      const json = (await res.json()) as AccountData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load account");
      applyAccount(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updatePrimaryEmail = (value: string) => {
    setPrimaryEmail(value);
    setEmails((current) =>
      current.map((entry) =>
        entry.isPrimary ? { ...entry, email: value } : entry,
      ),
    );
  };

  const addEmail = () => {
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    if (emails.some((entry) => normalizeEmail(entry.email) === normalizeEmail(trimmed))) {
      setError("That email is already on this account");
      return;
    }
    setEmails((current) => [...current, { email: trimmed, isPrimary: false }]);
    setNewEmail("");
    setError(null);
  };

  const removeEmail = (email: string) => {
    const entry = emails.find((item) => item.email === email);
    if (!entry || entry.isPrimary) return;
    setEmails((current) => current.filter((item) => item.email !== email));
  };

  const makePrimary = (email: string) => {
    setEmails((current) =>
      current.map((entry) => ({
        email: entry.email,
        isPrimary: entry.email === email,
      })),
    );
    setPrimaryEmail(email);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, readOnly, emails }),
      });
      const json = (await res.json()) as AccountData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      applyAccount(json);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    const label = username.trim() || "this account";
    const ok = await confirm(
      `Delete ${label} and all associated data — messages, contacts, groups, vault owner profile, and uploaded assets. This cannot be undone.`,
      "Delete account",
    );
    if (!ok) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/account", { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Delete failed");
      }
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <p className="text-[14px] text-muted">Loading…</p>;
  }

  const additionalEmails = emails.filter((entry) => !entry.isPrimary);

  return (
    <div className="max-w-xl space-y-8">
      <section>
        <p className="text-[13px] text-muted">
          Credentials for logging into Message Vault.
        </p>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-[13px] text-text">Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-elevated px-3 py-2 text-[14px] text-text outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-[13px] text-text">Primary email</span>
            <input
              type="email"
              value={primaryEmail}
              onChange={(e) => updatePrimaryEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-elevated px-3 py-2 text-[14px] text-text outline-none focus:border-accent"
            />
          </label>

          <div>
            <span className="text-[13px] text-text">Additional emails</span>
            {additionalEmails.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {additionalEmails.map((entry) => (
                  <AdditionalEmailRow
                    key={entry.email}
                    email={entry.email}
                    onMakePrimary={() => makePrimary(entry.email)}
                    onRemove={() => removeEmail(entry.email)}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[12px] text-muted">None</p>
            )}

            <div className="mt-3 flex gap-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Add another email…"
                className="min-w-0 flex-1 rounded-md border border-border bg-elevated px-3 py-2 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent"
              />
              <button
                type="button"
                onClick={addEmail}
                className="shrink-0 rounded-md border border-border bg-elevated px-3 py-2 text-[13px] text-text transition-colors hover:bg-white/10"
              >
                Add
              </button>
            </div>
          </div>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              className="mt-0.5 size-4 rounded border-border accent-accent"
            />
            <span>
              <span className="block text-[13px] text-text">Read-only mode</span>
              <span className="block text-[12px] text-muted">
                Prevent accidental edits to contacts, groups, and messages.
              </span>
            </span>
          </label>
        </div>
      </section>

      {data && (
        <section>
          <h2 className="text-[12px] font-semibold tracking-wider text-muted uppercase">
            Vault owner
          </h2>

          <dl className="mt-4 space-y-3 text-[14px]">
            <div>
              <dt className="text-[12px] text-muted">First name</dt>
              <dd className="mt-0.5 text-text">
                {data.vaultOwner.firstName || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Last name</dt>
              <dd className="mt-0.5 text-text">
                {data.vaultOwner.lastName || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Phones</dt>
              <dd className="mt-0.5 text-text">
                {data.vaultOwner.phones.length > 0 ? (
                  <ul className="list-disc list-outside pl-4">
                    {data.vaultOwner.phones.map((phone) => (
                      <li key={phone}>{phone}</li>
                    ))}
                  </ul>
                ) : (
                  "None"
                )}
              </dd>
              <p className="mt-1 text-[12px] text-muted">
                Stored in E.164 format. Reingest after changing.
              </p>
            </div>
          </dl>
        </section>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saving || deleting}
          onClick={() => void save()}
          className="rounded-md border border-border bg-elevated px-4 py-2 text-[13px] text-text transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-[13px] text-muted">Saved.</span>}
        {error && (
          <span className="text-[13px] text-red-400" role="alert">
            {error}
          </span>
        )}
      </div>

      {!data?.isDemo && (
        <section className="border-t border-border pt-8">
          <h2 className="text-[12px] font-semibold tracking-wider text-muted uppercase">
            Danger zone
          </h2>
          <p className="mt-2 text-[13px] text-muted">
            Permanently delete this account and all vault data tied to it.
          </p>
          <button
            type="button"
            disabled={saving || deleting}
            onClick={() => void deleteAccount()}
            className="mt-4 rounded-md border border-red-500/40 bg-red-500/15 px-4 py-2 text-[13px] text-red-100 transition-colors hover:bg-red-500/25 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete account"}
          </button>
        </section>
      )}

      {confirmDialog}
    </div>
  );
}

function AdditionalEmailRow({
  email,
  onMakePrimary,
  onRemove,
}: {
  email: string;
  onMakePrimary: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLLIElement>(null);

  useDismissible({
    open,
    onDismiss: () => setOpen(false),
    refs: [rootRef],
  });

  return (
    <li
      ref={rootRef}
      className="relative flex items-center justify-between gap-3 rounded-md border border-border bg-elevated px-3 py-2"
    >
      <span className="min-w-0 truncate text-[14px] text-text">{email}</span>
      <button
        type="button"
        aria-label={`Actions for ${email}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/10 hover:text-text"
      >
        <EllipsisIcon className="size-5" />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 min-w-[10.5rem] rounded-xl border border-border bg-[#2c2c2e] py-1 shadow-xl">
          <button
            type="button"
            className="flex w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20"
            onClick={() => {
              setOpen(false);
              onMakePrimary();
            }}
          >
            Make primary
          </button>
          <button
            type="button"
            className="flex w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            Remove
          </button>
        </div>
      )}
    </li>
  );
}
