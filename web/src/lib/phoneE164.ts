/** Strip non-digits; drop leading US country code 1 when 11 digits. */
export function sanitizePhoneDigits(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits;
}

const E164_RE = /^\+[1-9]\d{1,14}$/;

/** Format user input as E.164 when possible; returns null if invalid. */
export function toPhoneE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (E164_RE.test(trimmed)) {
    return trimmed;
  }

  const digits = sanitizePhoneDigits(trimmed);
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length >= 11) {
    return `+${digits}`;
  }
  return null;
}

export function formatOwnerName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

export function parsePhoneE164(input: string): string {
  const e164 = toPhoneE164(input);
  if (e164) return e164;

  throw new Error(
    "Enter a valid phone in E.164 format. US example: +14075551234 (country code +1, then 10 digits). You can paste (407) 555-1234 and we will normalize it.",
  );
}
