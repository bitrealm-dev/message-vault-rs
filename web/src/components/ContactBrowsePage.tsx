import { BrowsePageLayout } from "@/components/BrowsePageLayout";
import { BrowseShell } from "@/components/BrowseShell";
import { listContacts, listGroups, groupSlug } from "@/lib/db";
import { ensureUnknownContacts } from "@/lib/contactsWrite";
import { withServerAccount } from "@/lib/serverAccount";
import type { ContactSection } from "@/lib/types";

export async function ContactBrowsePage({
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
  return withServerAccount(async () => {
    ensureUnknownContacts();
    const contacts = listContacts(section);
    const groups = listGroups();
    const paneKey =
      typeof section === "object" ? `group-${groupSlug(section.group)}` : section;

    return (
      <BrowsePageLayout active={nav} groups={groups}>
        <BrowseShell
          paneStorageKey={paneKey}
          sectionLabel={label}
          contactSection={section}
          contacts={contacts}
          allGroups={groups}
          initialContactId={contactId}
        />
      </BrowsePageLayout>
    );
  });
}

export function parseContactId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
