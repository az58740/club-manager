import { getLocale } from "./i18n/locale";
import { M, tr, type Message } from "./i18n/messages";

const LOCALE_TAGS = { fa: "fa-IR", en: "en-GB" } as const;

const formatters = new Map<string, Intl.NumberFormat>();

function numberFormatter() {
  const tag = LOCALE_TAGS[getLocale()];
  let formatter = formatters.get(tag);
  if (!formatter) {
    formatter = new Intl.NumberFormat(tag);
    formatters.set(tag, formatter);
  }
  return formatter;
}

export function faNum(value: number) {
  return numberFormatter().format(value);
}

export function faDigits(value: string) {
  return value.replace(/\d/g, (digit) => numberFormatter().format(Number(digit)));
}

export function toman(value: number) {
  return `${faNum(Math.round(value))} ${tr(M.common.tomanUnit)}`;
}

const COMPACT_STEPS: { threshold: number; divisor: number; decimals: number; label: Message }[] = [
  { threshold: 1_000_000_000, divisor: 1_000_000_000, decimals: 1, label: M.common.billion },
  { threshold: 1_000_000, divisor: 1_000_000, decimals: 1, label: M.common.million },
  { threshold: 1_000, divisor: 1_000, decimals: 0, label: M.common.thousand },
];

export function compactToman(value: number) {
  for (const step of COMPACT_STEPS) {
    if (value < step.threshold) continue;
    const factor = 10 ** step.decimals;
    return `${faNum(Math.round((value / step.divisor) * factor) / factor)} ${tr(step.label)}`;
  }
  return faNum(value);
}

export function percent(value: number) {
  return `${faNum(Math.round(value))}${tr(M.common.percentSign)}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
}

export function uid(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
