import { TopNav } from "@/components/TopNav";
import { homeStats, listTags } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const stats = homeStats();
  const tags = listTags();

  const cards = [
    { href: "/all", label: "All", value: stats.all },
    { href: "/current", label: "Current", value: stats.current },
    { href: "/historical", label: "Historical", value: stats.historical },
    { href: "/groups", label: "Groups", value: stats.groups },
  ];

  return (
    <div className="flex h-full flex-col">
      <TopNav active="/" tags={tags} />
      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-8 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Message Vault</h1>
        <p className="mt-2 max-w-xl text-[14px] text-muted">
          Browse your imported messages by people, history, and groups.
        </p>

        <div className="mt-8 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-lg border border-border bg-panel px-4 py-4 transition hover:border-accent/50"
            >
              <div className="text-[12px] text-muted">{c.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</div>
            </Link>
          ))}
        </div>

        <div className="mt-6 text-[13px] text-muted">
          <span className="tabular-nums text-text">{stats.messages.toLocaleString()}</span>{" "}
          messages across{" "}
          <span className="tabular-nums text-text">{stats.contacts.toLocaleString()}</span>{" "}
          contacts
        </div>
      </main>
    </div>
  );
}
