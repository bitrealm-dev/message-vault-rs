import { redirect } from "next/navigation";

export default async function HistoricalRedirect({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.c ? `?c=${encodeURIComponent(sp.c)}` : "";
  redirect(`/tag/historical${q}`);
}
