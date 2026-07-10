import { BrowseShell } from "@/components/BrowseShell";
import { TopNav } from "@/components/TopNav";
import { listContacts } from "@/lib/db";
import type { ContactSection } from "@/lib/types";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

function SectionPage({
  section,
  label,
  nav,
  contactId,
}: {
  section: ContactSection;
  label: string;
  nav: string;
  contactId: number | null;
}) {
  const contacts = listContacts(section);
  return (
    <div className="flex h-full flex-col">
      <TopNav active={nav} />
      <div className="min-h-0 flex-1">
        <Suspense fallback={<div className="p-4 text-muted text-sm">Loading…</div>}>
          <BrowseShell
            section={section}
            sectionLabel={label}
            contacts={contacts}
            initialContactId={contactId}
          />
        </Suspense>
      </div>
    </div>
  );
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const sp = await searchParams;
  const contactId = sp.c ? Number(sp.c) : null;
  return (
    <SectionPage
      section="people"
      label="People"
      nav="/people"
      contactId={Number.isFinite(contactId) ? contactId : null}
    />
  );
}
