"use client";

import { setLocale, useLocale, type Locale } from "@/lib/i18n/locale";
import { cn } from "@/components/ui";

const OPTIONS: { value: Locale; label: string; short: string }[] = [
  { value: "fa", label: "فارسی", short: "فا" },
  { value: "en", label: "English", short: "EN" },
];

/** Each language names itself, so the switch never has to be translated. */
export function LocaleSwitch({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xl bg-slate-100 p-0.5",
        compact && "rounded-lg",
      )}
    >
      {OPTIONS.map((option) => {
        const active = option.value === locale;
        return (
          <button
            key={option.value}
            type="button"
            dir={option.value === "fa" ? "rtl" : "ltr"}
            aria-pressed={active}
            onClick={() => setLocale(option.value)}
            className={cn(
              "rounded-lg font-semibold transition",
              compact ? "px-1.5 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]",
              active
                ? "bg-white text-brand-700 shadow-sm"
                : "text-muted hover:bg-white/60 hover:text-ink",
            )}
          >
            {compact ? option.short : option.label}
          </button>
        );
      })}
    </div>
  );
}
