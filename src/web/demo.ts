import { minorUnits, tashkentToday, type Student, type Payment } from "./model";
const rows: [string, string, string][] = [
  ["Abdullayev Mirzo", "IELTS-1", "700000"],
  ["Karimova Sevinch", "General-2", "600000"],
  ["Murodov Sardor", "IELTS-1", "700000"],
  ["Tursunova Nigina", "Beginner-1", "500000"],
  ["Rahmonov Azizbek", "Speaking-1", "700000"],
  ["Ismoilova Dilnoza", "General-2", "600000"],
  ["Yusupov Behzod", "IELTS-2", "800000"],
  ["Qodirova Maftuna", "Beginner-2", "500000"],
];
let students: Student[] = rows.map(([name, group, monthlyFee], i) => ({
  id: i + 1,
  name,
  group,
  monthlyFee,
  phone: "+998 00 000 00 " + String(i + 1).padStart(2, "0"),
}));
let payments: Payment[] = [
  { id: 1, studentId: 1, amount: "700000" },
  { id: 2, studentId: 3, amount: "700000" },
  { id: 3, studentId: 4, amount: "250000" },
  { id: 4, studentId: 6, amount: "600000" },
  { id: 5, studentId: 7, amount: "400000" },
].map((p) => ({
  ...p,
  date: tashkentToday().slice(0, 7) + "-05",
  createdAt: new Date().toISOString(),
  method: "manual",
  simulated: false,
}));
const keys = new Map<string, Payment>();
let nextStudent = 9,
  nextPayment = 6;
export async function demoRequest(
  path: string,
  method: string,
  body?: any,
  key?: string,
): Promise<unknown> {
  const url = new URL(path, "https://demo.local");
  const sid = Number(url.pathname.split("/")[2]);
  if (path === "/session") return { ok: true, today: tashkentToday() };
  if (path === "/login" || path === "/logout") return { ok: true };
  if (url.pathname === "/students" && method === "GET")
    return structuredClone(students);
  if (url.pathname === "/students" && method === "POST") {
    const s = { ...body, id: nextStudent++ };
    students.push(s);
    return structuredClone(s);
  }
  if (/^\/students\/\d+$/.test(url.pathname) && method === "PATCH") {
    const s = students.find((s) => s.id === sid)!;
    Object.assign(s, body);
    return structuredClone(s);
  }
  if (/^\/students\/\d+$/.test(url.pathname) && method === "DELETE") {
    students = students.filter((s) => s.id !== sid);
    payments = payments.filter((p) => p.studentId !== sid);
    return undefined;
  }
  if (url.pathname === "/balances" || url.pathname === "/debtors") {
    const result = students.map((s) => {
      const paid = payments
        .filter(
          (p) =>
            p.studentId === s.id &&
            p.date.slice(0, 7) === url.searchParams.get("month"),
        )
        .reduce((n, p) => n + minorUnits(p.amount), 0);
      return {
        ...s,
        paid: String(paid / 100),
        debt: String(Math.max(0, minorUnits(s.monthlyFee) - paid) / 100),
      };
    });
    return result.filter(
      (s) => url.pathname === "/balances" || Number(s.debt) > 0,
    );
  }
  if (url.pathname.endsWith("/payments") && method === "GET")
    return payments
      .filter((p) => !sid || p.studentId === sid)
      .map((p) => ({
        ...p,
        studentName: students.find((s) => s.id === p.studentId)?.name,
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  if (url.pathname.endsWith("/payments") && method === "POST") {
    if (key && keys.has(key)) return keys.get(key);
    const p: Payment = {
      id: nextPayment++,
      studentId: sid,
      ...body,
      createdAt: new Date().toISOString(),
      simulated: ["payme", "click"].includes(body.method),
    };
    payments.push(p);
    if (key) keys.set(key, p);
    return structuredClone(p);
  }
  throw new Error("NOT_FOUND");
}
