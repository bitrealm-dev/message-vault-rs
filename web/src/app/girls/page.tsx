import { BrowseShell } from "@/components/BrowseShell";
import { TopNav } from "@/components/TopNav";
import { listContacts } from "@/lib/db";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function GirlsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const sp = await searchParams;
  const raw = sp.c ? Number(sp.c) : null;
  const contactId = Number.isFinite(raw) ? raw : null;
  const contacts = listContacts("girls");

  return (
    <div className="flex h-full flex-col">
      <TopNav active="/girls" />
      <div className="min-h-0 flex-1">
        <Suspense fallback={<div className="p-4 text-sm text-muted">Loading…</div>}>
          <BrowseShell
            section="girls"
            sectionLabel="Girls"
            contacts={contacts}
            initialContactId={contactId}
          />
        </Suspense>
      </div>
    </div>
  );
}
