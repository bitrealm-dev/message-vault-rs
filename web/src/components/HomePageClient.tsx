"use client";

import { AppShell } from "@/components/AppShell";
import Link from "next/link";

function StatCard({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-panel px-4 py-4 transition hover:border-accent/50"
    >
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </Link>
  );
}

export function HomePageClient({
  groups,
  stats,
}: {
  groups: string[];
  stats: {
    included: number;
    all: number;
    excluded: number;
    noMessages: number;
    groupChats: number;
    messages: number;
    messageDuplicates: number;
    contacts: number;
  };
}) {
  return (
    <AppShell active="/" groups={groups}>
      <main className="h-full min-h-0 min-w-0 overflow-y-auto bg-bg px-8 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Message Vault</h1>
        <p className="mt-2 max-w-xl text-[14px] text-muted">
          Browse your imported messages by contacts and group messages.
        </p>

        <section className="mt-8 max-w-3xl">
          <h2 className="text-[12px] font-semibold tracking-wider text-muted uppercase">
            Contacts
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <StatCard href="/all" label="All" value={stats.all} />
            <StatCard
              href="/contacts"
              label="Active"
              value={stats.included}
            />
            <StatCard
              href="/no-messages"
              label="No Messages"
              value={stats.noMessages}
            />
          </div>
        </section>

        <div className="mt-6 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            href="/group-chats-2"
            label="Group Messages"
            value={stats.groupChats}
          />
        </div>

        <div className="mt-6 text-[13px] text-muted">
          <span className="tabular-nums text-text">
            {stats.messages.toLocaleString()}
          </span>{" "}
          messages
          {stats.messageDuplicates > 0 && (
            <>
              {" · "}
              <span className="tabular-nums text-text">
                {stats.messageDuplicates.toLocaleString()}
              </span>{" "}
              duplicates
            </>
          )}
          {" across "}
          <span className="tabular-nums text-text">
            {stats.contacts.toLocaleString()}
          </span>{" "}
          contacts
        </div>
      </main>
    </AppShell>
  );
}
