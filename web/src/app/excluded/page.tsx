import { ContactBrowsePage, parseContactId } from "@/components/ContactBrowsePage";

export const dynamic = "force-dynamic";

export default async function ExcludedPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const sp = await searchParams;
  return (
    <ContactBrowsePage
      section="excluded"
      label="Excluded"
      nav="/excluded"
      contactId={parseContactId(sp.c)}
    />
  );
}
