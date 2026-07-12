import { HomePageClient } from "@/components/HomePageClient";
import { homeStats, listGroups } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const stats = homeStats();
  const groups = listGroups();
  return <HomePageClient groups={groups} stats={stats} />;
}
