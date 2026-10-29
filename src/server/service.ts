import {
  AppError,
  decimal,
  money,
  dateOnly,
  monthBounds,
  text,
} from "./domain";
export interface StudentRow {
  id: number;
  name: string;
  phone: string;
  group_name: string;
  monthly_fee: number;
  created_at: string;
}
interface PaymentRow {
  id: number;
  student_id: number;
  amount: number;
  date: string;
  method: string;
  created_at: string;
}
const studentDTO = (s: StudentRow) => ({
  id: s.id,
  name: s.name,
  phone: s.phone,
  group: s.group_name,
  monthlyFee: decimal(s.monthly_fee),
});
const paymentDTO = (p: PaymentRow) => ({
  id: p.id,
  studentId: p.student_id,
  amount: decimal(p.amount),
  date: p.date,
  createdAt: p.created_at.replace(" ", "T") + "Z",
  method: p.method,
  simulated: ["payme", "click"].includes(p.method),
});
export class Service {
  constructor(public db: D1Database) {}
  async find(sid: number) {
    const s = await this.db
      .prepare("SELECT * FROM students WHERE id=?")
      .bind(sid)
      .first<StudentRow>();
    if (!s) throw new AppError("STUDENT_NOT_FOUND", 404);
    return s;
  }
  async students() {
    const { results } = await this.db
      .prepare("SELECT * FROM students ORDER BY name,id")
      .all<StudentRow>();
    return results.map(studentDTO);
  }
  async create(input: Record<string, unknown>) {
    const name = text(input.name),
      phone = text(input.phone, 30),
      group = text(input.group, 80),
      fee = money(input.monthlyFee, true);
    const s = await this.db
      .prepare(
        "INSERT INTO students(name,phone,group_name,monthly_fee) VALUES(?,?,?,?) RETURNING *",
      )
      .bind(name, phone, group, fee)
      .first<StudentRow>();
    return studentDTO(s!);
  }
  async update(sid: number, input: Record<string, unknown>) {
    const s = await this.find(sid);
    const name = input.name === undefined ? s.name : text(input.name),
      phone = input.phone === undefined ? s.phone : text(input.phone, 30),
      group = input.group === undefined ? s.group_name : text(input.group, 80),
      fee =
        input.monthlyFee === undefined
          ? s.monthly_fee
          : money(input.monthlyFee, true);
    const updated = await this.db
      .prepare(
        "UPDATE students SET name=?,phone=?,group_name=?,monthly_fee=? WHERE id=? RETURNING *",
      )
      .bind(name, phone, group, fee, sid)
      .first<StudentRow>();
    if (!updated) throw new AppError("STUDENT_NOT_FOUND", 404);
    return studentDTO(updated);
  }
  async remove(sid: number) {
    const result = await this.db
      .prepare("DELETE FROM students WHERE id=? RETURNING id")
      .bind(sid)
      .first();
    if (!result) throw new AppError("STUDENT_NOT_FOUND", 404);
  }
  async payments(sid?: number) {
    if (sid !== undefined) await this.find(sid);
    const q =
      sid === undefined
        ? this.db.prepare(
            "SELECT p.*,s.name AS student_name FROM payments p JOIN students s ON s.id=p.student_id ORDER BY p.date DESC,p.id DESC LIMIT 500",
          )
        : this.db
            .prepare(
              "SELECT * FROM payments WHERE student_id=? ORDER BY date DESC,id DESC",
            )
            .bind(sid);
    const { results } = await q.all<PaymentRow & { student_name?: string }>();
    return results.map((p) => ({
      ...paymentDTO(p),
      studentName: p.student_name,
    }));
  }
  async pay(
    sid: number,
    input: Record<string, unknown>,
    key?: string,
    telegram = false,
  ) {
    const amount = money(input.amount),
      date = dateOnly(input.date),
      method = input.method ?? "manual";
    if (
      typeof method !== "string" ||
      !["manual", "payme", "click", ...(telegram ? ["telegram"] : [])].includes(
        String(method),
      )
    )
      throw new AppError("INVALID_METHOD");
    if (
      key &&
      (!/^[a-zA-Z0-9:_-]{8,160}$/.test(key) ||
        (!telegram && key.startsWith("tg:")))
    )
      throw new AppError("INVALID_KEY");
    await this.find(sid);
    const p = await this.db
      .prepare(
        "INSERT INTO payments(student_id,amount,date,method,idempotency_key) VALUES(?,?,?,?,?) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *",
      )
      .bind(sid, amount, date, method, key ?? null)
      .first<PaymentRow>();
    if (p) return { payment: paymentDTO(p), created: true };
    const old = await this.db
      .prepare("SELECT * FROM payments WHERE idempotency_key=?")
      .bind(key!)
      .first<PaymentRow>();
    if (
      !old ||
      old.student_id !== sid ||
      old.amount !== amount ||
      old.date !== date ||
      old.method !== method
    )
      throw new AppError("IDEMPOTENCY_CONFLICT", 409);
    return { payment: paymentDTO(old), created: false };
  }
  async balances(month: string) {
    const [start, end] = monthBounds(month);
    const { results } = await this.db
      .prepare(
        "SELECT s.*,COALESCE(SUM(p.amount),0) AS paid FROM students s LEFT JOIN payments p ON p.student_id=s.id AND p.date>=? AND p.date<? GROUP BY s.id ORDER BY s.name,s.id",
      )
      .bind(start, end)
      .all<StudentRow & { paid: number }>();
    return results.map((s) => ({
      ...studentDTO(s),
      paid: decimal(s.paid),
      debt: decimal(Math.max(0, s.monthly_fee - s.paid)),
    }));
  }
  async debtors(month: string) {
    return (await this.balances(month)).filter((s) => Number(s.debt) > 0);
  }
}
