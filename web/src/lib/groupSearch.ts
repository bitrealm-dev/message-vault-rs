import Fuse from "fuse.js";
import type { GroupYearRow } from "./types";

type SearchableGroup = GroupYearRow & {
  phoneDigits: string;
  namesJoined: string;
};

function toSearchable(g: GroupYearRow): SearchableGroup {
  return {
    ...g,
    phoneDigits: g.participantHandles.map((h) => h.replace(/\D/g, "")).join(" "),
    namesJoined: g.participantNames.join(" "),
  };
}

/** Ranked group search: people names, group title, phone digits. */
export function searchGroups(
  groups: GroupYearRow[],
  query: string,
): GroupYearRow[] {
  const q = query.trim();
  if (!q) return groups;

  const items = groups.map(toSearchable);
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && digits === q.replace(/[\s+\-().]/g, "")) {
    const phoneHits = items
      .filter((g) =>
        g.participantHandles.some((h) => h.replace(/\D/g, "").includes(digits)),
      )
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      });
    if (phoneHits.length) return phoneHits;
  }

  const fuse = new Fuse(items, {
    keys: [
      { name: "namesJoined", weight: 0.4 },
      { name: "title", weight: 0.2 },
      { name: "titleFull", weight: 0.15 },
      { name: "namedTitle", weight: 0.15 },
      { name: "participantHandles", weight: 0.05 },
      { name: "phoneDigits", weight: 0.1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 1,
    findAllMatches: false,
    useExtendedSearch: false,
  });

  return fuse.search(q).map((r) => r.item);
}
