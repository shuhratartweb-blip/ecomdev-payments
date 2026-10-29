import { useEffect, useRef, type ReactNode } from "react";
import { BookOpen, Sun, Leaf, X, Info } from "lucide-react";
import type { Lang } from "./model";
import type { Translation } from "./i18n";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <BookOpen size={27} strokeWidth={2.4} />
      </span>
      Ustoz<span className="brand-dot">.</span>
    </span>
  );
}
export function Preferences({
  lang,
  theme,
  setLang,
  setTheme,
  t,
}: {
  lang: Lang;
  theme: string;
  setLang: (v: Lang) => void;
  setTheme: (v: string) => void;
  t: Translation;
}) {
  return (
    <div className="preferences">
      <div className="segmented" role="group" aria-label={t.theme}>
        <button
          title={t.light}
          aria-pressed={theme === "light"}
          onClick={() => setTheme("light")}
        >
          <Sun size={16} />
          <span>{t.light}</span>
        </button>
        <button
          title={t.warm}
          aria-pressed={theme === "warm"}
          onClick={() => setTheme("warm")}
        >
          <Leaf size={16} />
          <span>{t.warm}</span>
        </button>
      </div>
      <div className="segmented language" role="group" aria-label={t.language}>
        <button aria-pressed={lang === "ru"} onClick={() => setLang("ru")}>
          RU
        </button>
        <button aria-pressed={lang === "uz"} onClick={() => setLang("uz")}>
          UZ
        </button>
      </div>
    </div>
  );
}
export function ProviderLogo({ provider }: { provider: "payme" | "click" }) {
  return (
    <img
      className={`provider-logo ${provider}`}
      src={`/brands/${provider}.svg`}
      alt={provider === "payme" ? "Payme" : "Click"}
    />
  );
}

export function DemoBanner({
  t,
  onPay,
}: {
  t: Translation;
  onPay: (method: "payme" | "click") => void;
}) {
  return (
    <section className="payment-banner">
      <Info size={27} />
      <div>
        <h2>{t.testPayment}</h2>
        <p>{t.testNote}</p>
      </div>
      <div className="provider-buttons">
        <button onClick={() => onPay("payme")} aria-label="Payme">
          <ProviderLogo provider="payme" />
        </button>
        <button onClick={() => onPay("click")} aria-label="Click">
          <ProviderLogo provider="click" />
        </button>
      </div>
    </section>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
  t,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  t: Translation;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          disabled={busy}
          aria-label={t.close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  note,
  icon,
}: {
  title: string;
  note: string;
  icon: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{note}</p>
    </div>
  );
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s[0])
        .join("")}
    </span>
  );
}
