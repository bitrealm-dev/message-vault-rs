/** iMessage-style: any handle containing `@` is treated as email. */
export function isEmailHandle(handle: string): boolean {
  return handle.includes("@");
}

/** Handles safe for contacts.csv `phones` column. */
export function phoneHandlesOnly(handles: string[]): string[] {
  return handles.filter((h) => h.trim() !== "" && !isEmailHandle(h));
}

/** Preferred display phone: first non-email handle, else first handle. */
export function preferredPhoneHandle(handles: string[]): string | null {
  const phones = phoneHandlesOnly(handles);
  if (phones[0]) return phones[0];
  const first = handles.map((h) => h.trim()).find(Boolean);
  return first ?? null;
}
