"use client";

import {
  applyCountryCodeDigitsInput,
  handleCountryCodeKeyDown,
  normalizeCountryCodeDigitsOnBlur,
  toPhoneE164FromParts,
} from "@/lib/phoneE164";
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [countryCode, setCountryCode] = useState("1");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedPhone = toPhoneE164FromParts(countryCode, phone);

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
        body: JSON.stringify({
          username,
          primaryEmail,
          firstName,
          lastName,
          phone: normalizedPhone ?? phone,
        }),
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
      <div className="w-full max-w-lg rounded-xl border border-border bg-elevated p-8 shadow-xl">
        <h1 className="text-2xl font-bold tracking-tight text-text">Login</h1>

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

        <section
          className={
            accounts.length > 0 ? "mt-8 border-t-2 border-border pt-8" : "mt-8"
          }
        >
          <h2 className="text-2xl font-bold tracking-tight text-text">
            Create a User
          </h2>
          <p className="mb-4 mt-4 text-[12px] text-muted">
            Your name and phone identify you in imported messages and are required
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
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[13px] text-text">First name</span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="text-[13px] text-text">Last name</span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent"
                />
              </label>
            </div>
            <div className="block">
              <div className="grid grid-cols-[4.25rem_minmax(12rem,1fr)_16ch] gap-x-2 gap-y-1">
                <span className="text-[13px] text-text">Country</span>
                <span className="text-[13px] text-text">Phone</span>
                <span className="text-[13px] text-text">e.164</span>
                <div className="flex min-h-[2.5rem] items-center overflow-hidden rounded-md border border-border bg-bg">
                  <span
                    aria-hidden
                    className="shrink-0 pl-1.5 text-[14px] font-mono text-muted"
                  >
                    +
                  </span>
                  <input
                    type="tel"
                    value={countryCode}
                    onChange={(e) =>
                      setCountryCode(applyCountryCodeDigitsInput(e.target.value))
                    }
                    onKeyDown={handleCountryCodeKeyDown}
                    onBlur={(e) =>
                      setCountryCode(normalizeCountryCodeDigitsOnBlur(e.target.value))
                    }
                    aria-label="Country code"
                    className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-0.5 pr-1 text-left text-[14px] font-mono text-text outline-none"
                  />
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 789-1234"
                  aria-label="Phone number"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent"
                />
                <div
                  aria-live="polite"
                  className="flex min-h-[2.5rem] min-w-[16ch] shrink-0 items-center rounded-md border border-border bg-bg/60 px-3 py-2 text-[14px] font-mono"
                >
                  {normalizedPhone ? (
                    <span className="text-text">{normalizedPhone}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </div>
              </div>
              <p className="mt-1.5 text-[12px] text-muted">
                US numbers: <span className="text-text">+1</span> with 10 digits —
                e.g. <span className="font-mono text-text">+15557891234</span>{" "}
                <span className="text-text">→</span>{" "}
                <span className="text-text">(555) 789-1234</span>
              </p>
              <p className="mt-1 text-[12px] text-muted">
                International: change country code, then enter your number.
              </p>
            </div>
            <button
              type="button"
              disabled={
                submitting ||
                !username.trim() ||
                !primaryEmail.trim() ||
                !firstName.trim() ||
                !phone.trim() ||
                !normalizedPhone
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
