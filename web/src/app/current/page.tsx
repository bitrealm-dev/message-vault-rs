import { ContactBrowsePage, parseContactId } from "@/components/ContactBrowsePage";

export const dynamic = "force-dynamic";

export default async function CurrentPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const sp = await searchParams;
  return (
    <ContactBrowsePage
      section="current"
      label="Current"
      nav="/current"
      contactId={parseContactId(sp.c)}
    />
  );
}
