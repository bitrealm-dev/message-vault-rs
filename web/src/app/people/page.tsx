import { redirect } from "next/navigation";

export default async function PeopleRedirect({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.c ? `?c=${encodeURIComponent(sp.c)}` : "";
  redirect(`/current${q}`);
}
