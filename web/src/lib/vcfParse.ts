/** Minimal VCF 3.0 parser (aligned with crates message-vault-rs `src/vcf.rs`). */

export type VcfCard = {
  fnRaw: string;
  nFamily: string;
  nGiven: string;
  nMiddle: string;
  phones: string[];
  email: string | null;
};

function unescape(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function unfoldLines(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (out.length > 0) {
        out[out.length - 1] += line.slice(1);
      }
      continue;
    }
    out.push(line);
  }
  return out;
}

function applyLine(card: VcfCard, line: string): void {
  const colon = line.indexOf(":");
  if (colon < 0) return;
  const name = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const prop = name.split(";")[0] ?? name;
  let propUpper = prop.toUpperCase();
  const dot = propUpper.lastIndexOf(".");
  if (dot >= 0) {
    propUpper = propUpper.slice(dot + 1);
  }

  switch (propUpper) {
    case "FN":
      card.fnRaw = unescape(value);
      break;
    case "N": {
      const parts = value.split(";");
      card.nFamily = unescape(parts[0] ?? "");
      card.nGiven = unescape(parts[1] ?? "");
      card.nMiddle = unescape(parts[2] ?? "");
      break;
    }
    case "TEL": {
      const phone = value.trim();
      if (phone && !card.phones.includes(phone)) {
        card.phones.push(phone);
      }
      break;
    }
    case "EMAIL": {
      if (!card.email) {
        const email = value.trim();
        if (email) card.email = email;
      }
      break;
    }
    default:
      break;
  }
}

/** Parse a VCF document into cards. */
export function parseVcfText(text: string): VcfCard[] {
  const lines = unfoldLines(text);
  const cards: VcfCard[] = [];
  let current: VcfCard | null = null;

  for (const line of lines) {
    if (line.toUpperCase() === "BEGIN:VCARD") {
      current = {
        fnRaw: "",
        nFamily: "",
        nGiven: "",
        nMiddle: "",
        phones: [],
        email: null,
      };
      continue;
    }
    if (line.toUpperCase() === "END:VCARD") {
      if (current) {
        cards.push(current);
        current = null;
      }
      continue;
    }
    if (current) applyLine(current, line);
  }
  return cards;
}

/** Extract `[Tag]` values; return stripped text and tags. */
export function extractTags(raw: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === "[") {
      let tag = "";
      i++;
      while (i < raw.length && raw[i] !== "]") {
        tag += raw[i];
        i++;
      }
      const trimmed = tag.trim();
      if (trimmed) tags.push(trimmed);
    } else {
      out += ch;
    }
  }
  const text = out.split(/\s+/).filter(Boolean).join(" ");
  return { text, tags };
}

export function stripTags(raw: string): string {
  return extractTags(raw).text;
}

export type VcfContactDraft = {
  firstName: string;
  lastName: string;
  phones: string[];
  labels: string[];
};

/** Map a VCF card to a contact draft (names + raw phones; normalize later). */
export function cardToDraft(card: VcfCard): VcfContactDraft {
  const { text: fnStripped, tags: fnTags } = extractTags(card.fnRaw);
  const first = stripTags(card.nGiven);
  const last = stripTags(card.nFamily);

  const nickname =
    !last &&
    fnStripped &&
    !fnStripped.includes(" ") &&
    (!first || first === fnStripped)
      ? fnStripped
      : "";

  const firstName = nickname || first;
  const lastName = nickname ? "" : last;

  const labels = fnTags
    .map((t) => t.trim())
    .filter((t) => t && t.toLowerCase() !== "people");

  return {
    firstName,
    lastName,
    phones: [...card.phones],
    labels: [...new Set(labels)],
  };
}
