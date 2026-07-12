import { BrowsePageLayout } from "@/components/BrowsePageLayout";
import { BrowseShell } from "@/components/BrowseShell";
import { listContacts, listTags, tagSlug } from "@/lib/db";
import type { ContactSection } from "@/lib/types";

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
    <BrowsePageLayout active={nav} tags={tags}>
      <BrowseShell
        section={paneKey}
        sectionLabel={label}
        browseSection={section}
        contacts={contacts}
        allTags={tags}
        initialContactId={contactId}
      />
    </BrowsePageLayout>
  );
}

export function parseContactId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
