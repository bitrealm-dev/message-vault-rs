import { ContactBrowsePage, parseContactId } from "@/components/ContactBrowsePage";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const sp = await searchParams;
  return (
    <ContactBrowsePage
      section="contacts"
      label="Active"
      nav="/contacts"
      contactId={parseContactId(sp.c)}
    />
  );
}
