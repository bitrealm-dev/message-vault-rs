import { HomePageClient } from "@/components/HomePageClient";
import { homeStats, listGroups } from "@/lib/db";
import { withServerAccount } from "@/lib/serverAccount";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return withServerAccount(async () => {
    const stats = homeStats();
    const groups = listGroups();
    return <HomePageClient groups={groups} stats={stats} />;
  });
}
