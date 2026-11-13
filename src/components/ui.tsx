"use client";

import clsx, { type ClassValue } from "clsx";
import { M, useT } from "@/lib/i18n/messages";
import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useClub } from "@/lib/store";
import { faDigits, faNum, initials } from "@/lib/format";
import { latinDigits, parseJalaliInput, toDateInput, toJalaliInput } from "@/lib/date";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/* ---------------------------------- card ---------------------------------- */

export function Card({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag
      className={cn(
        "rounded-3xl bg-white ring-1 ring-line/80 shadow-[0_18px_40px_-32px_rgba(16,24,40,0.35)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/* --------------------------------- buttons -------------------------------- */

type ButtonVariant = "primary" | "soft" | "outline" | "ghost" | "danger" | "dark" | "accent";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white shadow-[0_14px_28px_-14px_rgba(47,71,214,0.85)] hover:bg-brand-700 active:bg-brand-800",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200",
  outline: "bg-white text-ink ring-1 ring-line hover:bg-slate-50 active:bg-slate-100",
  ghost: "text-ink-soft hover:bg-slate-100 active:bg-slate-200",
  danger:
    "bg-rose-600 text-white shadow-[0_14px_28px_-14px_rgba(225,29,72,0.8)] hover:bg-rose-700",
  dark: "bg-night-900 text-white hover:bg-night-800",
  accent:
    "bg-accent-500 text-night-900 shadow-[0_14px_28px_-14px_rgba(243,166,59,0.9)] hover:bg-accent-400",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5 rounded-xl",
  md: "h-11 px-4.5 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-2xl",
  icon: "h-10 w-10 rounded-xl",
};

export function buttonStyles(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(
    "inline-flex items-center justify-center font-medium transition-all duration-200 select-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:pointer-events-none disabled:opacity-50",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button className={buttonStyles(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

/* --------------------------------- badges --------------------------------- */

type BadgeTone = "brand" | "emerald" | "amber" | "rose" | "slate" | "violet" | "blue" | "sky";

const badgeTones: Record<BadgeTone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-200/70",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  amber: "bg-amber-50 text-amber-700 ring-amber-200/70",
  rose: "bg-rose-50 text-rose-700 ring-rose-200/70",
  slate: "bg-slate-100 text-slate-600 ring-slate-200/70",
  violet: "bg-violet-50 text-violet-700 ring-violet-200/70",
  blue: "bg-blue-50 text-blue-700 ring-blue-200/70",
  sky: "bg-sky-50 text-sky-700 ring-sky-200/70",
};

export function Badge({
  children,
  tone = "slate",
  className,
  dot = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap",
        badgeTones[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> : null}
      {children}
    </span>
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", className)} />;
}

/* --------------------------------- avatars -------------------------------- */

const avatarGradients = [
  "from-sky-400 to-blue-600",
  "from-amber-300 to-orange-500",
  "from-emerald-400 to-teal-600",
  "from-violet-400 to-purple-600",
  "from-rose-400 to-pink-600",
  "from-cyan-400 to-sky-600",
  "from-lime-400 to-emerald-600",
  "from-fuchsia-400 to-purple-600",
];

const avatarSizes = {
  xs: "h-8 w-8 text-[11px]",
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-2xl",
};

export function Avatar({
  name,
  src,
  size = "md",
  className,
  ring = true,
}: {
  name: string;
  src?: string;
  size?: keyof typeof avatarSizes;
  className?: string;
  ring?: boolean;
}) {
  const hash = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const gradient = avatarGradients[hash % avatarGradients.length];
  if (src) {
    return (
      <span
        className={cn(
          "inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100",
          avatarSizes[size],
          ring && "ring-2 ring-white",
          className,
        )}
        aria-hidden="true"
      >
        <img src={src} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white",
        gradient,
        avatarSizes[size],
        ring && "ring-2 ring-white",
        className,
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/* ---------------------------------- forms --------------------------------- */

export function Field({
  label,
  hint,
  className,
  children,
  required,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="flex items-center gap-1 text-[13px] font-medium text-ink-soft">
        {label}
        {required ? <span className="text-rose-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}

const controlClasses =
  "w-full rounded-xl bg-slate-50/80 px-3.5 text-sm text-ink ring-1 ring-inset ring-line placeholder:text-muted/60 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClasses, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClasses, "min-h-24 py-2.5", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(controlClasses, "h-11 appearance-none pl-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function JalaliDateInput({
  value,
  onChange,
  className,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const shown = draft ?? (value ? faDigits(toJalaliInput(value)) : "");

  const handleChange = (raw: string) => {
    const digits = latinDigits(raw)
      .replace(/\D/g, "")
      .slice(0, 8);
    const formatted =
      digits.length > 6
        ? `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`
        : digits.length > 4
          ? `${digits.slice(0, 4)}/${digits.slice(4)}`
          : digits;
    setDraft(formatted);
    if (!digits) {
      setInvalid(false);
      onChange("");
      return;
    }
    if (digits.length === 8) {
      const parsed = parseJalaliInput(digits);
      if (parsed) {
        setInvalid(false);
        onChange(toDateInput(parsed));
      } else {
        setInvalid(true);
      }
    } else {
      setInvalid(false);
    }
  };

  return (
    <div className="relative">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t(M.ui.jalaliExample)}
        value={shown}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={(event) => {
          props.onBlur?.(event);
          setDraft(null);
          setInvalid(false);
        }}
        dir="ltr"
        className={cn(
          controlClasses,
          "h-11 pl-14 text-right tabular-nums ltr:text-left",
          invalid && "ring-rose-400 focus:ring-rose-500",
          className,
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setDraft(null);
          setInvalid(false);
          onChange(toDateInput(new Date()));
        }}
        className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg px-1.5 py-1 text-[10px] font-medium text-brand-600 transition hover:bg-brand-50"
      >
        {t(M.ui.todayButton)}
      </button>
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = undefined,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? t(M.ui.searchPlaceholder)}
        className={cn(controlClasses, "h-11 pe-10", value && "ps-9")}
        type="search"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute start-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-slate-100"
          aria-label={t(M.ui.clearSearch)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------- segmented ------------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  options: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-2xl bg-slate-100/90 p-1",
        className,
      )}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl font-medium transition-all duration-200",
              size === "sm" ? "h-8 px-2 text-[12px]" : "h-9 px-3 text-[13px]",
              active
                ? "bg-white text-ink shadow-[0_4px_14px_-8px_rgba(16,24,40,0.4)] ring-1 ring-line/60"
                : "text-muted hover:text-ink",
            )}
          >
            {option.label}
            {typeof option.count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] leading-none",
                  active ? "bg-brand-50 text-brand-700" : "bg-slate-200/80 text-muted",
                )}
              >
                {faNum(option.count)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------- sheet --------------------------------- */

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade bg-night-900/45 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-sheet flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line/70 px-5 pb-4 pt-5 sm:px-6">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-ink">{title}</h2>
            {description ? <p className="text-xs text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-slate-100 hover:text-ink"
            aria-label={t(M.ui.close)}
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
        {footer ? (
          <div className="border-t border-line/70 bg-white px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 sm:px-6 sm:pb-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------- misc ---------------------------------- */

export function Progress({
  value,
  className,
  tone = "bg-brand-600",
}: {
  value: number;
  className?: string;
  tone?: string;
}) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", tone)}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-line bg-white/60 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        {icon}
      </div>
      <p className="mt-1 text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-xs text-xs leading-6 text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-muted">{label}</p>
        {icon ? (
          <span className={cn("grid h-8 w-8 place-items-center rounded-xl", badgeTones[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xl font-extrabold tracking-tight text-ink sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </Card>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="space-y-1">
        <h1 className="text-xl font-extrabold tracking-tight text-ink sm:text-[26px]">{title}</h1>
        {subtitle ? <p className="text-[13px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid h-10 w-10 place-items-center rounded-[14px] bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-[0_12px_24px_-12px_rgba(31,47,135,0.8)]",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
        <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 3.75c-2.9 3.1-3.9 6.6-2.7 10.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M3.9 9.1c4.5-.7 8.3.8 11 4.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M20.1 9.1c-4.5-.7-8.3.8-11 4.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function ClubLogo({ logo, className }: { logo?: string; className?: string }) {
  const t = useT();
  if (logo) {
    return (
      <span
        className={cn(
          "grid h-10 w-10 place-items-center overflow-hidden rounded-[14px] bg-white ring-1 ring-line",
          className,
        )}
      >
        <img src={logo} alt={t(M.ui.clubLogoAlt)} className="h-full w-full object-cover" />
      </span>
    );
  }
  return <BrandMark className={className} />;
}

export function Splash() {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <BrandMark className="h-14 w-14 animate-pop rounded-2xl [&>svg]:h-8 [&>svg]:w-8" />
        <p className="text-xs font-medium text-muted">{mounted ? t(M.ui.preparingClub) : ""}</p>
      </div>
    </div>
  );
}

/* --------------------------------- toasts --------------------------------- */

export function Toasts() {
  const { toasts, dismissToast } = useClub();

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-8">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismissToast(toast.id)}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 text-start text-[13px] font-medium text-white shadow-xl animate-rise",
            toast.tone === "error"
              ? "bg-rose-600"
              : toast.tone === "info"
                ? "bg-night-900"
                : "bg-emerald-600",
          )}
        >
          {toast.tone === "success" ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <span className="grid h-4 w-4 place-items-center rounded-full border border-white/60 text-[10px]">
              !
            </span>
          )}
          <span className="flex-1">{toast.message}</span>
        </button>
      ))}
    </div>
  );
}
