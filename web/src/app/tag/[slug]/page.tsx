import { ContactBrowsePage, parseContactId } from "@/components/ContactBrowsePage";
import { tagFromSlug } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tag = tagFromSlug(slug);
  if (!tag) notFound();

  return (
    <ContactBrowsePage
      section={{ tag }}
      label={tag}
      nav={`/tag/${slug}`}
      contactId={parseContactId(sp.c)}
    />
  );
}
