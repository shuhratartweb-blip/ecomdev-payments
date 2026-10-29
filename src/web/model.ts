export type Lang = "ru" | "uz";
export interface Student {
  id: number;
  name: string;
  phone: string;
  group: string;
  monthlyFee: string;
}
export interface Balance extends Student {
  paid: string;
  debt: string;
}
export interface Payment {
  id: number;
  studentId: number;
  studentName?: string;
  amount: string;
  date: string;
  createdAt?: string;
  method: "manual" | "payme" | "click" | "telegram";
  simulated: boolean;
}
export function minorUnits(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function formatAmount(value: string | number, lang: Lang) {
  return new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "uz-UZ", {
    maximumFractionDigits: 0,
  }).format(typeof value === "string" ? Number(value) : value / 100);
}
export function summarize(
  rows: Pick<Balance, "monthlyFee" | "paid" | "debt">[],
) {
  return rows.reduce(
    (a, s) => ({
      expected: a.expected + minorUnits(s.monthlyFee),
      paid: a.paid + minorUnits(s.paid),
      debt: a.debt + minorUnits(s.debt),
    }),
    { expected: 0, paid: 0, debt: 0 },
  );
}
export function validMonth(value: string) {
  return (
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
    value >= "2000-01" &&
    value <= "9998-12"
  );
}
export function validPayment(amount: string, date: string) {
  if (
    !/^\d{1,10}(\.00)?$/.test(amount) ||
    minorUnits(amount) <= 0 ||
    minorUnits(amount) > 100000000000
  )
    return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "2000-01-01") return false;
  const d = new Date(date + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date;
}
export function tashkentToday(instant = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  return ["year", "month", "day"]
    .map((k) => p.find((v) => v.type === k)?.value)
    .join("-");
}
const months = {
  ru: [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ],
  uz: [
    "Yanvar",
    "Fevral",
    "Mart",
    "Aprel",
    "May",
    "Iyun",
    "Iyul",
    "Avgust",
    "Sentabr",
    "Oktabr",
    "Noyabr",
    "Dekabr",
  ],
};
export function formatMonth(value: string, lang: Lang) {
  return `${months[lang][Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
}

export function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}
export function parseDateInput(value: string) {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(value)) return "";
  const [day, month, year] = value.split("-");
  const iso = `${year}-${month}-${day}`;
  return validPayment("1", iso) ? iso : "";
}
export function formatTimestamp(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
