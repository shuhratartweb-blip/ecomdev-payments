export class AppError extends Error {
  constructor(
    public code: string,
    public status: 400 | 401 | 403 | 404 | 409 | 429 | 503 = 400,
  ) {
    super(code);
  }
}
export function money(value: unknown, zero = false): number {
  if (typeof value !== "string" || !/^\d{1,10}(\.00)?$/.test(value))
    throw new AppError("INVALID_AMOUNT");
  const [whole, frac = ""] = value.split(".");
  const n = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 100000000000 || n < (zero ? 0 : 1))
    throw new AppError("INVALID_AMOUNT");
  return n;
}
export const decimal = (n: number) => String(n / 100);
export function dateOnly(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "2000-01-01" ||
    value > "9999-12-31"
  )
    throw new AppError("INVALID_DATE");
  const d = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw new AppError("INVALID_DATE");
  return value;
}
export function monthBounds(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ||
    value < "2000-01" ||
    value > "9998-12"
  )
    throw new AppError("INVALID_MONTH");
  const y = Number(value.slice(0, 4)),
    m = Number(value.slice(5));
  return [
    value + "-01",
    `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`,
  ];
}
export function id(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value))
    throw new AppError("INVALID_ID");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new AppError("INVALID_ID");
  return n;
}
export function text(value: unknown, max = 120) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new AppError("INVALID_FIELDS");
  return value.trim();
}
export function today(timezone = "Asia/Tashkent", instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  return ["year", "month", "day"]
    .map((t) => parts.find((p) => p.type === t)!.value)
    .join("-");
}
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new AppError("INVALID_FIELDS");
  return value as Record<string, unknown>;
}
