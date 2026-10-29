import { useEffect, useState, useRef, useCallback } from "react";
import {
  Users,
  UserRound,
  Wallet,
  Plus,
  Search,
  CheckCircle2,
  ReceiptText,
  Coins,
  LogOut,
  History,
  Pencil,
  Trash2,
  ArrowUpRight,
  LoaderCircle,
  AlertCircle,
  RefreshCw,
  X,
  ChevronRight,
} from "lucide-react";
import { api, ApiError, preview } from "./client";
import {
  Brand,
  Preferences,
  Avatar,
  DemoBanner,
  Empty,
  Modal,
} from "./components";
import { StudentForm, PaymentForm, errorText } from "./forms";
import { translations } from "./i18n";
import {
  formatAmount,
  formatDate,
  formatTimestamp,
  formatMonth,
  summarize,
  tashkentToday,
  validMonth,
  type Lang,
  type Student,
  type Payment,
  type Balance,
} from "./model";
type Page = "debtors" | "students" | "payments";
type Dialog =
  | { kind: "student"; student?: Student }
  | { kind: "payment"; student?: Student; method?: Payment["method"] }
  | { kind: "history"; student: Student }
  | { kind: "delete"; student: Student };
function stored(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export default function App() {
  const [lang, setLang] = useState<Lang>(
      stored("ustoz-lang", "ru") === "uz" ? "uz" : "ru",
    ),
    [theme, setTheme] = useState(
      stored("ustoz-theme", "light") === "warm" ? "warm" : "light",
    );
  const [session, setSession] = useState<"loading" | "in" | "out" | "error">(
      preview ? "in" : "loading",
    ),
    [sessionError, setSessionError] = useState(""),
    [page, setPage] = useState<Page>("debtors"),
    [month, setMonth] = useState(tashkentToday().slice(0, 7));
  const [students, setStudents] = useState<Student[]>([]),
    [balances, setBalances] = useState<Balance[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [search, setSearch] = useState(""),
    [group, setGroup] = useState(""),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [toast, setToast] = useState("");
  const t = translations(lang);
  const mounted = useRef(true);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
    document.title =
      lang === "ru" ? "Ustoz — Учёт оплат" : "Ustoz — To‘lovlar hisobi";
    try {
      localStorage.setItem("ustoz-lang", lang);
      localStorage.setItem("ustoz-theme", theme);
    } catch {}
  }, [lang, theme]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const checkSession = useCallback(async () => {
    setSession("loading");
    try {
      const result = await api<{ today: string }>("/session");
      if (mounted.current) {
        setMonth(result.today.slice(0, 7));
        setSession("in");
      }
    } catch (e) {
      if (mounted.current) {
        setSessionError(e instanceof ApiError ? e.code : "error");
        setSession(e instanceof ApiError && e.status === 401 ? "out" : "error");
      }
    }
  }, []);
  useEffect(() => {
    if (!preview) void checkSession();
  }, [checkSession]);
  useEffect(() => {
    if (session !== "in") return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api<Student[]>("/students", { signal: controller.signal }),
      api<Balance[]>("/balances?month=" + month, { signal: controller.signal }),
      api<Payment[]>("/payments", { signal: controller.signal }),
    ])
      .then(([s, b, p]) => {
        if (active) {
          setStudents(s);
          setBalances(b);
          setPayments(p);
        }
      })
      .catch((e) => {
        if (!active || e.name === "AbortError") return;
        if (e instanceof ApiError && e.status === 401) {
          setSession("out");
          setDialog(null);
        } else setError(e instanceof ApiError ? e.code : "error");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [session, month, revision]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const refresh = (message: string) => {
    setDialog(null);
    setRevision((x) => x + 1);
    setToast(message);
  };
  const prefs = (
    <Preferences
      lang={lang}
      theme={theme}
      setLang={setLang}
      setTheme={setTheme}
      t={t}
    />
  );
  const totals = summarize(balances);
  const debtors = balances.filter((s) => Number(s.debt) > 0);
  const source = page === "debtors" ? debtors : students;
  const filtered = source.filter(
    (s) =>
      (!group || s.group === group) &&
      `${s.name} ${s.group} ${s.phone} ${s.id}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  async function logout() {
    try {
      await api("/logout", { method: "POST" });
      setSession("out");
      setStudents([]);
      setBalances([]);
      setPayments([]);
    } catch (e) {
      setToast(errorText(e, t));
    }
  }
  if (session !== "in")
    return (
      <div className="login-page">
        <header className="topbar">
          <Brand />
          {prefs}
        </header>
        <main className="login-main">
          {session === "loading" ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              {t.loading}
            </div>
          ) : session === "error" ? (
            <div className="login-card">
              <AlertCircle className="login-symbol" />
              <h1>{t.error}</h1>
              <p>{t[sessionError as keyof typeof t] ?? t.network}</p>
              <button
                className="primary full"
                onClick={() => void checkSession()}
              >
                <RefreshCw size={17} />
                {t.retry}
              </button>
            </div>
          ) : (
            <Login t={t} onSuccess={() => void checkSession()} />
          )}
        </main>
        <footer className="login-footer">Ustoz · {t.created}</footer>
      </div>
    );
  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="header-right">
          {prefs}
          <button
            className="logout icon-button"
            title={t.logout}
            aria-label={t.logout}
            onClick={() => void logout()}
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>
      <aside className="sidebar">
        <nav aria-label={t.created}>
          {(
            [
              { id: "debtors", icon: Users },
              { id: "students", icon: UserRound },
              { id: "payments", icon: Wallet },
            ] as const
          ).map(({ id, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => {
                setPage(id);
                setSearch("");
                setGroup("");
              }}
            >
              <Icon size={20} />
              <span>{t[id]}</span>
              {id === "debtors" && debtors.length > 0 && (
                <small>{debtors.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="sidebar-mini-mark">
            <ReceiptText size={18} />
          </span>
          <span>
            Ustoz
            <br />
            <small>{t.created}</small>
          </span>
        </div>
      </aside>
      <main className="main-content">
        {preview && (
          <div className="preview-bar">
            <span>
              <strong>{t.preview}</strong> · {t.previewNote}
            </span>
            <a href="/">
              {t.login}
              <ArrowUpRight size={15} />
            </a>
          </div>
        )}
        <div className="page-heading">
          <div>
            <h1>{t[page]}</h1>
            <p>
              {page === "students"
                ? `${t.total}: ${students.length}`
                : page === "payments"
                  ? t.lastPayments
                  : formatMonth(month, lang)}
            </p>
          </div>
          <div className="heading-actions">
            {page === "debtors" && (
              <label className="month-picker">
                <span className="sr-only">{t.month}</span>
                <span className="month-display" aria-hidden="true">
                  {formatMonth(month, lang)}
                </span>
                <input
                  type="month"
                  value={month}
                  min="2000-01"
                  max="9998-12"
                  onChange={(e) => {
                    if (validMonth(e.target.value)) setMonth(e.target.value);
                  }}
                />
              </label>
            )}
            <button
              className="primary"
              disabled={
                loading ||
                !!error ||
                (page !== "students" && students.length === 0)
              }
              onClick={() =>
                setDialog(
                  page === "students"
                    ? { kind: "student" }
                    : { kind: "payment" },
                )
              }
            >
              <Plus size={18} />
              {page === "students" ? t.addStudent : t.addPayment}
            </button>
          </div>
        </div>
        {page === "debtors" && (
          <section className="metrics" aria-label={t.created}>
            {[
              {
                label: t.expected,
                value: totals.expected,
                icon: ReceiptText,
                tone: "blue",
              },
              {
                label: t.paid,
                value: totals.paid,
                icon: CheckCircle2,
                tone: "green",
              },
              {
                label: t.remaining,
                value: totals.debt,
                icon: Coins,
                tone: "orange",
              },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div className="metric" key={label}>
                <span className={`metric-icon ${tone}`}>
                  <Icon size={23} />
                </span>
                <div>
                  <p>{label}</p>
                  <strong>
                    {loading || error ? "—" : formatAmount(value, lang)}{" "}
                    <small>UZS</small>
                  </strong>
                </div>
              </div>
            ))}
          </section>
        )}
        {error ? (
          <div className="error-state" role="alert">
            <AlertCircle />
            <h2>{t[error as keyof typeof t] ?? t.error}</h2>
            <button
              className="secondary"
              onClick={() => setRevision((x) => x + 1)}
            >
              <RefreshCw size={16} />
              {t.retry}
            </button>
          </div>
        ) : loading ? (
          <div className="loading table-loading">
            <LoaderCircle className="spin" />
            {t.loading}
          </div>
        ) : page === "payments" ? (
          <PaymentTable payments={payments} lang={lang} t={t} />
        ) : (
          <section className="data-panel">
            {source.length > 0 && (
              <div className="table-toolbar">
                <label className="search-box">
                  <Search size={17} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t.search}
                    aria-label={t.search}
                  />
                  {search && (
                    <button
                      className="icon-button"
                      aria-label={t.close}
                      onClick={() => setSearch("")}
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
                <select
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  aria-label={t.group}
                >
                  <option value="">{t.allGroups}</option>
                  {[...new Set(source.map((s) => s.group))].sort().map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </div>
            )}
            {filtered.length === 0 ? (
              <Empty
                icon={page === "debtors" ? <CheckCircle2 /> : <Users />}
                title={
                  search || group
                    ? t.noResults
                    : page === "debtors"
                      ? t.noDebtors
                      : t.noStudents
                }
                note={
                  search || group
                    ? t.noResultsNote
                    : page === "debtors"
                      ? t.noDebtorsNote
                      : t.noStudentsNote
                }
              />
            ) : (
              <>
                <div className="desktop-table">
                  <table>
                    <thead>
                      <tr>
                        <th>{t.student}</th>
                        <th>{t.group}</th>
                        {page === "students" && <th>{t.phone}</th>}
                        <th className="numeric">{t.tariff}</th>
                        {page === "debtors" && (
                          <>
                            <th className="numeric">{t.paid}</th>
                            <th className="numeric">{t.debt}</th>
                          </>
                        )}
                        <th>
                          <span className="sr-only">{t.actions}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <button
                              className="student-cell"
                              onClick={() =>
                                setDialog({ kind: "history", student: s })
                              }
                            >
                              <Avatar name={s.name} />
                              <span>
                                <strong>{s.name}</strong>
                                <small>#{String(s.id).padStart(3, "0")}</small>
                              </span>
                            </button>
                          </td>
                          <td>
                            <span className="group-label">{s.group}</span>
                          </td>
                          {page === "students" && (
                            <td className="muted">{s.phone}</td>
                          )}
                          <td className="numeric">
                            {formatAmount(s.monthlyFee, lang)}
                          </td>
                          {page === "debtors" && (
                            <>
                              <td className="numeric muted">
                                {formatAmount((s as Balance).paid, lang)}
                              </td>
                              <td className="numeric debt-number">
                                {formatAmount((s as Balance).debt, lang)}
                              </td>
                            </>
                          )}
                          <td>
                            <div className="row-actions">
                              {page === "debtors" ? (
                                <button
                                  className="pay-button"
                                  onClick={() =>
                                    setDialog({ kind: "payment", student: s })
                                  }
                                >
                                  {t.pay}
                                  <ChevronRight size={14} />
                                </button>
                              ) : (
                                <>
                                  <button
                                    className="icon-button"
                                    title={t.history}
                                    aria-label={`${t.history}: ${s.name}`}
                                    onClick={() =>
                                      setDialog({ kind: "history", student: s })
                                    }
                                  >
                                    <History size={17} />
                                  </button>
                                  <button
                                    className="icon-button"
                                    title={t.edit}
                                    aria-label={`${t.edit}: ${s.name}`}
                                    onClick={() =>
                                      setDialog({ kind: "student", student: s })
                                    }
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  <button
                                    className="icon-button delete-button"
                                    title={t.delete}
                                    aria-label={`${t.delete}: ${s.name}`}
                                    onClick={() =>
                                      setDialog({ kind: "delete", student: s })
                                    }
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mobile-students">
                  {filtered.map((s) => (
                    <article className="student-card" key={s.id}>
                      <div className="student-card-top">
                        <button
                          className="student-cell"
                          onClick={() =>
                            setDialog({ kind: "history", student: s })
                          }
                        >
                          <Avatar name={s.name} />
                          <span>
                            <strong>{s.name}</strong>
                            <small>
                              {s.group} · #{s.id}
                            </small>
                          </span>
                        </button>
                        {page === "debtors" && (
                          <strong className="mobile-debt">
                            {formatAmount((s as Balance).debt, lang)}
                            <small>UZS</small>
                          </strong>
                        )}
                      </div>
                      <div className="student-card-bottom">
                        <span>
                          {page === "debtors"
                            ? `${t.paid}: ${formatAmount((s as Balance).paid, lang)}`
                            : s.phone}
                        </span>
                        {page === "debtors" ? (
                          <button
                            className="pay-button"
                            onClick={() =>
                              setDialog({ kind: "payment", student: s })
                            }
                          >
                            {t.pay}
                            <ChevronRight size={14} />
                          </button>
                        ) : (
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              aria-label={`${t.edit}: ${s.name}`}
                              onClick={() =>
                                setDialog({ kind: "student", student: s })
                              }
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button delete-button"
                              aria-label={`${t.delete}: ${s.name}`}
                              onClick={() =>
                                setDialog({ kind: "delete", student: s })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="table-footer">
                  <span>
                    {t.total}: {filtered.length}
                    {filtered.length !== source.length
                      ? ` ${t.of} ${source.length}`
                      : ""}
                  </span>
                  <span>UZS</span>
                </div>
              </>
            )}
          </section>
        )}
        {page === "debtors" && (
          <>
            <DemoBanner
              t={t}
              onPay={(method) => {
                if (students.length) setDialog({ kind: "payment", method });
                else {
                  setPage("students");
                  setDialog({ kind: "student" });
                }
              }}
            />
            <p className="calculation-note">{t.balanceNote}</p>
          </>
        )}
      </main>
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={19} />
          {toast}
          <button
            className="icon-button"
            aria-label={t.close}
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {dialog?.kind === "student" && (
        <StudentForm
          student={dialog.student}
          t={t}
          onClose={() => setDialog(null)}
          onSaved={() => refresh(t.studentSaved)}
        />
      )}
      {dialog?.kind === "payment" && (
        <PaymentForm
          students={students}
          selected={dialog.student}
          method={dialog.method}
          date={tashkentToday()}
          lang={lang}
          t={t}
          onClose={() => setDialog(null)}
          onSaved={() => refresh(t.success)}
        />
      )}
      {dialog?.kind === "history" && (
        <HistoryModal
          student={dialog.student}
          t={t}
          lang={lang}
          onClose={() => setDialog(null)}
          onPay={() => setDialog({ kind: "payment", student: dialog.student })}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteModal
          student={dialog.student}
          t={t}
          onClose={() => setDialog(null)}
          onDeleted={() => refresh(t.studentDeleted)}
        />
      )}
    </div>
  );
}
function Login({
  t,
  onSuccess,
}: {
  t: ReturnType<typeof translations>;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="login-card"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await api("/login", { method: "POST", body: { password } });
          onSuccess();
        } catch (e) {
          setError(errorText(e, t));
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="login-symbol">
        <ReceiptText size={28} />
      </span>
      <h1>{t.loginTitle}</h1>
      <p>{t.loginNote}</p>
      <label>
        {t.password}
        <input
          disabled={busy}
          autoFocus
          required
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy}>
        {busy ? t.loginPending : t.login}
        <ArrowUpRight size={18} />
      </button>
      <small>{t.loginHelp}</small>
      <a className="preview-link" href="/?preview=1">
        {t.previewLink}
        <ChevronRight size={15} />
      </a>
    </form>
  );
}
function PaymentTable({
  payments,
  lang,
  t,
}: {
  payments: Payment[];
  lang: Lang;
  t: ReturnType<typeof translations>;
}) {
  if (!payments.length)
    return (
      <div className="data-panel">
        <Empty icon={<Wallet />} title={t.noPayments} note={t.noPaymentsNote} />
      </div>
    );
  return (
    <div className="data-panel payment-history">
      <table>
        <thead>
          <tr>
            <th>{t.student}</th>
            <th>{t.date}</th>
            <th>{t.recordedAt}</th>
            <th>{t.method}</th>
            <th className="numeric">{t.sum}, UZS</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.studentName ?? `#${p.studentId}`}</strong>
                <small className="payment-id">#{p.id}</small>
              </td>
              <td>{formatDate(p.date)}</td>
              <td className="timestamp-cell">{formatTimestamp(p.createdAt)}</td>
              <td>
                <span className="method-label">
                  {p.method === "manual"
                    ? t.manual
                    : p.method === "telegram"
                      ? "Telegram"
                      : p.method === "payme"
                        ? "Payme"
                        : "Click"}
                </span>
                {p.simulated && (
                  <small className="simulation-tag">{t.simulation}</small>
                )}
              </td>
              <td className="numeric payment-amount">
                +{formatAmount(p.amount, lang)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function HistoryModal({
  student,
  t,
  lang,
  onClose,
  onPay,
}: {
  student: Student;
  t: ReturnType<typeof translations>;
  lang: Lang;
  onClose: () => void;
  onPay: () => void;
}) {
  const [rows, setRows] = useState<Payment[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    api<Payment[]>(`/students/${student.id}/payments`, { signal: c.signal })
      .then(setRows)
      .catch((e) => {
        if (e.name !== "AbortError") setError(errorText(e, t));
      })
      .finally(() => setLoading(false));
    return () => c.abort();
  }, [student.id]);
  return (
    <Modal title={t.history} onClose={onClose} t={t}>
      <div className="history-heading">
        <Avatar name={student.name} />
        <div>
          <strong>{student.name}</strong>
          <p>
            {student.group} · {student.phone}
          </p>
        </div>
      </div>
      {loading ? (
        <div className="loading">{t.loading}</div>
      ) : error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : (
        <PaymentTable
          payments={rows.map((p) => ({ ...p, studentName: student.name }))}
          lang={lang}
          t={t}
        />
      )}
      <div className="modal-footer">
        <button className="secondary" onClick={onClose}>
          {t.close}
        </button>
        <button className="primary" onClick={onPay}>
          <Plus size={17} />
          {t.addPayment}
        </button>
      </div>
    </Modal>
  );
}
function DeleteModal({
  student,
  t,
  onClose,
  onDeleted,
}: {
  student: Student;
  t: ReturnType<typeof translations>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={t.deleteTitle} onClose={onClose} busy={busy} t={t}>
      <div className="form-fields">
        <strong>{student.name}</strong>
        <p className="muted">{t.deleteNote}</p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
      <div className="modal-footer">
        <button className="secondary" disabled={busy} onClick={onClose}>
          {t.cancel}
        </button>
        <button
          className="danger"
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              await api(`/students/${student.id}`, { method: "DELETE" });
              onDeleted();
            } catch (e) {
              setError(errorText(e, t));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t.saving : t.delete}
        </button>
      </div>
    </Modal>
  );
}
