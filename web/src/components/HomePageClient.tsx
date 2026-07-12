"use client";

import { AppShell } from "@/components/AppShell";
import Link from "next/link";

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
    unassigned: number;
    groupChats: number;
    messages: number;
    contacts: number;
  };
}) {
  const cards = [
    { href: "/contacts", label: "Contacts", value: stats.included },
    { href: "/all", label: "All", value: stats.all },
    { href: "/excluded", label: "Excluded", value: stats.excluded },
    { href: "/no-messages", label: "No Messages", value: stats.noMessages },
    { href: "/unassigned", label: "Unassigned", value: stats.unassigned },
    { href: "/group-chats", label: "Group Chats", value: stats.groupChats },
  ];

  return (
    <AppShell active="/" groups={groups}>
      <main className="h-full min-h-0 min-w-0 overflow-y-auto bg-bg px-8 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Message Vault</h1>
        <p className="mt-2 max-w-xl text-[14px] text-muted">
          Browse your imported messages by contacts and group chats.
        </p>

        <div className="mt-8 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-lg border border-border bg-panel px-4 py-4 transition hover:border-accent/50"
            >
              <div className="text-[12px] text-muted">{c.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {c.value}
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 text-[13px] text-muted">
          <span className="tabular-nums text-text">
            {stats.messages.toLocaleString()}
          </span>{" "}
          messages across{" "}
          <span className="tabular-nums text-text">
            {stats.contacts.toLocaleString()}
          </span>{" "}
          contacts
        </div>
      </main>
    </AppShell>
  );
}
