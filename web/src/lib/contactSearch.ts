import Fuse from "fuse.js";
import type { ContactListItem } from "./types";

type SearchableContact = ContactListItem & {
  phoneDigits: string;
  initials: string;
};

function toSearchable(c: ContactListItem): SearchableContact {
  const first = c.firstName ?? "";
  const last = c.lastName ?? "";
  const nick = c.nickname ?? "";
  const initials = [first, last, nick]
    .filter(Boolean)
    .map((p) => p.trim().charAt(0))
    .join("")
    .toLowerCase();
  return {
    ...c,
    phoneDigits: (c.preferredPhone ?? "").replace(/\D/g, ""),
    initials,
  };
}

/** Ranked contact search: names, nickname, phone, initials; tolerates typos. */
export function searchContacts(
  contacts: ContactListItem[],
  query: string,
): ContactListItem[] {
  const q = query.trim();
  if (!q) return contacts;

  const items = contacts.map(toSearchable);
  const fuse = new Fuse(items, {
    keys: [
      { name: "displayName", weight: 0.35 },
      { name: "firstName", weight: 0.2 },
      { name: "lastName", weight: 0.2 },
      { name: "nickname", weight: 0.15 },
      { name: "preferredPhone", weight: 0.05 },
      { name: "phoneDigits", weight: 0.1 },
      { name: "initials", weight: 0.1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 1,
    // Prefer exact-ish matches over loose subsequence noise
    findAllMatches: false,
    useExtendedSearch: false,
  });

  // Digits-only queries: prefer phone match
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && digits === q.replace(/[\s+\-().]/g, "")) {
    const phoneHits = items
      .filter((c) => c.phoneDigits.includes(digits))
      .sort((a, b) => {
        const ai = a.phoneDigits.indexOf(digits);
        const bi = b.phoneDigits.indexOf(digits);
        return ai - bi || a.displayName.localeCompare(b.displayName);
      });
    if (phoneHits.length) return phoneHits;
  }

  return fuse.search(q).map((r) => r.item);
}
