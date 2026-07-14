"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AccountOption = {
  id: string;
  username: string;
  primaryEmail: string;
};

export function LoginScreen() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [username, setUsername] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async (): Promise<AccountOption[]> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/accounts");
      const json = (await res.json()) as {
        accounts?: AccountOption[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load users");
      const list = json.accounts ?? [];
      setAccounts(list);
      setSelectedId(list[0]?.id ?? "");
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const continueAsExisting = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selectedId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Sign in failed");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  const createAndContinue = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, primaryEmail, displayName, phone }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (res.status === 409) {
          const listRes = await fetch("/api/auth/accounts");
          const listJson = (await listRes.json()) as {
            accounts?: AccountOption[];
          };
          const list = listJson.accounts ?? [];
          setAccounts(list);
          const match = list.find(
            (a) => a.username.toLowerCase() === username.trim().toLowerCase(),
          );
          if (match) setSelectedId(match.id);
        }
        throw new Error(json.error ?? "Create failed");
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <p className="text-[14px] text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-elevated p-8 shadow-xl">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          Message Vault
        </h1>

        {accounts.length > 0 && (
          <section className="mt-8">
            <label className="block">
              <span className="text-[13px] text-text">User</span>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-text outline-none focus:border-accent"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.username} ({account.primaryEmail})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={submitting || !selectedId}
              onClick={() => void continueAsExisting()}
              className="mt-4 w-full rounded-md border border-border bg-bg px-4 py-2 text-[13px] text-text transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {submitting ? "Continuing…" : "Continue"}
            </button>
          </section>
        )}

        <section className={accounts.length > 0 ? "mt-8 border-t border-border pt-8" : "mt-8"}>
          {accounts.length > 0 && (
            <p className="mb-4 text-[12px] text-muted">Or create a user</p>
          )}
          <p className="mb-4 text-[12px] text-muted">
            Display name and phone identify you in imported messages and are required
            before ingest.
          </p>
          <div className="space-y-4">
            <label className="block">
              <span className="text-[13px] text-text">Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-text outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[13px] text-text">Email</span>
              <input
                type="email"
                value={primaryEmail}
                onChange={(e) => setPrimaryEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-text outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[13px] text-text">Display name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name in message threads"
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[13px] text-text">Phone</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+15555550100"
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent"
              />
            </label>
            <button
              type="button"
              disabled={
                submitting ||
                !username.trim() ||
                !primaryEmail.trim() ||
                !displayName.trim() ||
                !phone.trim()
              }
              onClick={() => void createAndContinue()}
              className="w-full rounded-md border border-border bg-bg px-4 py-2 text-[13px] text-text transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create and continue"}
            </button>
          </div>
        </section>

        {error && (
          <p className="mt-4 text-[13px] text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
