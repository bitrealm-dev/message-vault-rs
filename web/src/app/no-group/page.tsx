import { ContactBrowsePage, parseContactId } from "@/components/ContactBrowsePage";

export const dynamic = "force-dynamic";

export default async function NoGroupPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const sp = await searchParams;
  return (
    <ContactBrowsePage
      section="no-group"
      label="No label"
      nav="/no-group"
      contactId={parseContactId(sp.c)}
    />
  );
}
