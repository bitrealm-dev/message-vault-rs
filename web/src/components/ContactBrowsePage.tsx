import { BrowseShell } from "@/components/BrowseShell";
import { TopNav } from "@/components/TopNav";
import { listContacts, listTags, tagSlug } from "@/lib/db";
import type { ContactSection } from "@/lib/types";
import { Suspense } from "react";

export function ContactBrowsePage({
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
  const tags = listTags();
  const paneKey =
    typeof section === "object" ? `tag-${tagSlug(section.tag)}` : section;

  return (
    <div className="flex h-full flex-col">
      <TopNav active={nav} tags={tags} />
      <div className="min-h-0 flex-1">
        <Suspense fallback={<div className="p-4 text-sm text-muted">Loading…</div>}>
          <BrowseShell
            section={paneKey}
            sectionLabel={label}
            contacts={contacts}
            initialContactId={contactId}
          />
        </Suspense>
      </div>
    </div>
  );
}

export function parseContactId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
