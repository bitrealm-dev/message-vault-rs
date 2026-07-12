import { ContactBrowsePage, parseContactId } from "@/components/ContactBrowsePage";
import { groupFromSlug } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const group = groupFromSlug(slug);
  if (!group) notFound();

  return (
    <ContactBrowsePage
      section={{ group }}
      label={group}
      nav={`/group/${slug}`}
      contactId={parseContactId(sp.c)}
    />
  );
}
