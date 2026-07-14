"use client";

import { useCallback, useEffect, useState } from "react";

type AccountData = {
  username: string;
  loginEmail: string;
  readOnly: boolean;
  vaultOwner: {
    displayName: string;
    phones: string[];
  };
};

export function SettingsAccountForm() {
  const [data, setData] = useState<AccountData | null>(null);
  const [username, setUsername] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/account");
      const json = (await res.json()) as AccountData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load account");
      setData(json);
      setUsername(json.username);
      setLoginEmail(json.loginEmail);
      setReadOnly(json.readOnly);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, loginEmail, readOnly }),
      });
      const json = (await res.json()) as AccountData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setData(json);
      setUsername(json.username);
      setLoginEmail(json.loginEmail);
      setReadOnly(json.readOnly);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-[14px] text-muted">Loading…</p>;
  }

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
            <span className="text-[13px] text-text">User email</span>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-elevated px-3 py-2 text-[14px] text-text outline-none focus:border-accent"
            />
          </label>

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
              <dt className="text-[12px] text-muted">Display name</dt>
              <dd className="mt-0.5 text-text">{data.vaultOwner.displayName}</dd>
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
                Taken from config.toml. Reingest after changing.
              </p>
            </div>
          </dl>
        </section>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
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
    </div>
  );
}
