import Database from "better-sqlite3";
import { currentAccountId } from "./accountScope";
import { createContact, patchContact } from "./contactsWrite";
import { getContact } from "./contactsRead";
import { dbPath } from "./paths";
import { toPhoneE164 } from "./phoneE164";
import { assertVaultWritable } from "./owner";
import { cardToDraft, parseVcfText } from "./vcfParse";

export type VcfImportSummary = {
  cardsTotal: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

function findContactIdByPhone(phone: string, accountId: string): number | null {
  const db = new Database(dbPath(), { readonly: true });
  try {
    const row = db
      .prepare(
        `SELECT contact_id FROM contact_handles WHERE account_id = ? AND handle = ?`,
      )
      .get(accountId, phone) as { contact_id: number } | undefined;
    return row?.contact_id ?? null;
  } finally {
    db.close();
  }
}

function normalizePhones(raw: string[]): string[] {
  const out: string[] = [];
  for (const p of raw) {
    const e164 = toPhoneE164(p);
    if (!e164) continue;
    if (!out.includes(e164)) out.push(e164);
  }
  return out;
}

/**
 * Import contacts from a VCF document into the current account.
 * Cards without usable phones are skipped. Existing phones merge into that contact.
 */
export function importContactsFromVcf(text: string): VcfImportSummary {
  assertVaultWritable();
  const accountId = currentAccountId();
  const cards = parseVcfText(text);

  const summary: VcfImportSummary = {
    cardsTotal: cards.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    const draft = cardToDraft(card);
    const phones = normalizePhones(draft.phones);
    if (phones.length === 0) {
      summary.skipped += 1;
      continue;
    }

    let firstName = draft.firstName.trim();
    let lastName = draft.lastName.trim();
    if (!firstName && !lastName) {
      firstName = card.fnRaw.trim() || phones[0]!;
    }

    try {
      const owners = phones
        .map((p) => findContactIdByPhone(p, accountId))
        .filter((id): id is number => id != null);
      const uniqueOwners = [...new Set(owners)];

      if (uniqueOwners.length === 0) {
        createContact({
          firstName: firstName || null,
          lastName: lastName || null,
          phones,
          labels: draft.labels,
        });
        summary.created += 1;
        continue;
      }

      // Merge into the first matching contact; add phones that are free.
      const intoId = uniqueOwners[0]!;
      if (uniqueOwners.length > 1) {
        summary.errors.push(
          `Card ${i + 1}: phones belong to multiple contacts; updated contact ${intoId} only`,
        );
      }

      const existing = getContact(intoId);
      if (!existing) {
        summary.errors.push(`Card ${i + 1}: contact ${intoId} missing`);
        summary.skipped += 1;
        continue;
      }

      const mergedPhones = [...existing.phones];
      for (const p of phones) {
        const owner = findContactIdByPhone(p, accountId);
        if (owner == null) {
          mergedPhones.push(p);
        } else if (owner !== intoId) {
          // Owned by another contact — leave alone
          continue;
        }
      }

      const nextFirst =
        existing.firstName?.trim() || firstName || null;
      const nextLast = existing.lastName?.trim() || lastName || null;
      const nextLabels = [
        ...new Set([...existing.labels, ...draft.labels]),
      ];

      const phonesChanged =
        mergedPhones.length !== existing.phones.length ||
        mergedPhones.some((p, idx) => p !== existing.phones[idx]);
      const namesChanged =
        nextFirst !== (existing.firstName ?? null) ||
        nextLast !== (existing.lastName ?? null);
      const labelsChanged =
        nextLabels.length !== existing.labels.length ||
        nextLabels.some((l) => !existing.labels.includes(l));

      if (phonesChanged || namesChanged || labelsChanged) {
        patchContact(intoId, {
          firstName: nextFirst,
          lastName: nextLast,
          phones: phonesChanged ? mergedPhones : undefined,
          labels: labelsChanged ? nextLabels : undefined,
        });
        summary.updated += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`Card ${i + 1}: ${message}`);
      summary.skipped += 1;
    }
  }

  return summary;
}
