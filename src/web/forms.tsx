import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, ArrowLeft, ShieldCheck } from "lucide-react";
import { api, ApiError } from "./client";
import { Modal, ProviderLogo } from "./components";
import {
  formatAmount,
  formatDate,
  parseDateInput,
  formatTimestamp,
  validPayment,
  type Student,
  type Payment,
  type Lang,
} from "./model";
import type { Translation } from "./i18n";
export function errorText(error: unknown, t: Translation) {
  const code = error instanceof ApiError ? error.code : "error";
  return t[code as keyof Translation] ?? t.error;
}
export function StudentForm({
  student,
  t,
  onClose,
  onSaved,
}: {
  student?: Student;
  t: Translation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    const f = new FormData(e.currentTarget);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(student ? `/students/${student.id}` : "/students", {
        method: student ? "PATCH" : "POST",
        body: {
          name: f.get("name"),
          phone: f.get("phone"),
          group: f.get("group"),
          monthlyFee: String(f.get("monthlyFee")).replace(",", "."),
        },
      });
      onSaved();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={student ? t.editStudent : t.newStudent}
      onClose={onClose}
      busy={busy}
      t={t}
    >
      <form onSubmit={save}>
        <div className="form-fields">
          <label>
            {t.name}
            <input
              disabled={busy}
              autoFocus
              name="name"
              defaultValue={student?.name}
              required
              maxLength={120}
              autoComplete="name"
            />
          </label>
          <label>
            {t.phone}
            <input
              disabled={busy}
              name="phone"
              defaultValue={student?.phone}
              required
              maxLength={30}
              type="tel"
              autoComplete="tel"
              placeholder="+998"
            />
          </label>
          <div className="form-row">
            <label>
              {t.group}
              <input
                disabled={busy}
                name="group"
                defaultValue={student?.group}
                required
                maxLength={80}
              />
            </label>
            <label>
              {t.monthlyFee}
              <input
                disabled={busy}
                name="monthlyFee"
                defaultValue={student?.monthlyFee}
                required
                type="number"
                min="0"
                max="1000000000"
                step="1"
                inputMode="numeric"
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t.cancel}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? t.saving : t.save}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PaymentForm({
  students,
  selected,
  method: initialMethod = "manual",
  date: initialDate,
  t,
  lang,
  onClose,
  onSaved,
}: {
  students: Student[];
  selected?: Student;
  method?: Payment["method"];
  date: string;
  t: Translation;
  lang: Lang;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sid, setSid] = useState(String(selected?.id ?? "")),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(formatDate(initialDate)),
    [method, setMethod] = useState(initialMethod),
    [step, setStep] = useState<"form" | "confirm" | "success">("form"),
    [receipt, setReceipt] = useState<Payment | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    key = useRef(crypto.randomUUID());
  const simulated = method === "click" || method === "payme";
  function update() {
    key.current = crypto.randomUUID();
    setError("");
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!sid || !validPayment(amount, parseDateInput(date))) {
      setError(t.invalidPayment);
      return;
    }
    if (simulated) setStep("confirm");
    else void save();
  }
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await api<Payment>(`/students/${sid}/payments`, {
        method: "POST",
        key: key.current,
        body: { amount, date: parseDateInput(date), method },
      });
      setReceipt(saved);
      setStep("success");
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const isoDate = parseDateInput(date);
  const student = students.find((s) => String(s.id) === sid);
  return (
    <Modal
      title={
        step === "success"
          ? t.success
          : step === "confirm"
            ? t.paymentDetails
            : t.addPayment
      }
      onClose={step === "success" ? onSaved : onClose}
      busy={busy}
      t={t}
    >
      {step === "success" ? (
        <div className="payment-success">
          <span>
            <CheckCircle2 size={46} />
          </span>
          <h3>
            {formatAmount(amount, lang)} <small>UZS</small>
          </h3>
          <p>{student?.name}</p>
          <p>{formatDate(receipt?.date ?? isoDate)}</p>
          {receipt?.createdAt && (
            <p className="field-note">
              {t.recordedAt}: {formatTimestamp(receipt.createdAt)}
            </p>
          )}
          {simulated && (
            <div className="simulation-note">
              {t.simulation} · {method === "payme" ? "Payme" : "Click"}
            </div>
          )}
          <button className="primary full" onClick={onSaved}>
            {t.close}
          </button>
        </div>
      ) : step === "confirm" ? (
        <div className="confirmation">
          <ProviderLogo provider={method as "payme" | "click"} />
          <p className="simulation-note">
            <ShieldCheck size={17} />
            {t.testPayment}
          </p>
          <dl>
            <div>
              <dt>{t.student}</dt>
              <dd>{student?.name}</dd>
            </div>
            <div>
              <dt>{t.date}</dt>
              <dd>{formatDate(isoDate)}</dd>
            </div>
            <div className="confirm-amount">
              <dt>{t.sum}</dt>
              <dd>{formatAmount(amount, lang)} UZS</dd>
            </div>
          </dl>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button
            className="primary full"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? t.saving : t.simulateSuccess}
          </button>
          <div className="confirm-bottom">
            <button
              disabled={busy}
              className="text-button"
              onClick={() => setStep("form")}
            >
              <ArrowLeft size={15} />
              {t.back}
            </button>
            <button disabled={busy} className="text-button" onClick={onClose}>
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="form-fields">
            <label>
              {t.student}
              <select
                disabled={busy}
                autoFocus
                required
                value={sid}
                onChange={(e) => {
                  setSid(e.target.value);
                  update();
                }}
              >
                <option value="">{t.chooseStudent}</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · #{s.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                {t.amount}
                <input
                  disabled={busy}
                  required
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    update();
                  }}
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="1"
                  max="1000000000"
                  placeholder="0"
                />
              </label>
              <label>
                {t.date}
                <input
                  disabled={busy}
                  required
                  type="text"
                  inputMode="numeric"
                  value={date}
                  placeholder="DD-MM-YYYY"
                  pattern="[0-9]{2}-[0-9]{2}-[0-9]{4}"
                  maxLength={10}
                  onChange={(e) => {
                    setDate(e.target.value);
                    update();
                  }}
                />
              </label>
            </div>
            <fieldset className="method-field">
              <legend>{t.method}</legend>
              <div className="method-options">
                {(["manual", "payme", "click"] as const).map((m) => (
                  <label key={m} className={method === m ? "selected" : ""}>
                    <input
                      disabled={busy}
                      type="radio"
                      name="method"
                      checked={method === m}
                      onChange={() => {
                        setMethod(m);
                        update();
                      }}
                    />
                    {m === "manual" ? (
                      <span>{t.manual}</span>
                    ) : (
                      <ProviderLogo provider={m} />
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className={simulated ? "simulation-note" : "field-note"}>
              {simulated ? t.testPayment : t.paymentNote}
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={busy}
            >
              {t.cancel}
            </button>
            <button className="primary" disabled={busy}>
              {busy ? t.saving : simulated ? t.continue : t.save}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
