export function normalizeDisplayName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizePlayerName(value: unknown): string {
  return normalizeDisplayName(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitPlayerName(value: unknown) {
  const fullName = normalizeDisplayName(value);
  const parts = fullName.split(" ").filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "", fullName };
  return { firstName: parts[0], lastName: parts.slice(1).join(" "), fullName };
}

export function parseDateOnlyToUTCNoon(value: unknown): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const mdy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return date;
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return date;
  }

  return null;
}

export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function permanentPlayerIdentityKey(fullName: string, dob: Date): string {
  const normalizedName = normalizePlayerName(fullName);
  if (!normalizedName) throw new Error("Player name is required.");
  return `dob:${normalizedName}|${utcDateKey(dob)}`;
}
