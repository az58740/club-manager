import { isValidJalaaliDate, toGregorian, toJalaali } from "jalaali-js";
import { getLocale } from "./i18n/locale";
import { M, tr } from "./i18n/messages";
import { faNum } from "./format";

const dayMs = 24 * 60 * 60 * 1000;

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** English mode keeps the Jalali calendar but uses Latin names and digits. */
function localeTag() {
  return getLocale() === "fa" ? "fa-IR" : "en-GB";
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function jalaliFormatter(options: Intl.DateTimeFormatOptions) {
  const tag = localeTag();
  const key = `${tag}|${JSON.stringify(options)}`;
  let formatter = dateFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(tag, {
      calendar: "persian",
      timeZone: "Asia/Tehran",
      ...options,
    });
    dateFormatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * `Intl` tags a Jalali year in English as `1405 AP`; the era suffix is noise in a
 * club schedule, so the formatted parts are rejoined without it.
 */
function formatJalali(value: Date, options: Intl.DateTimeFormatOptions) {
  const formatter = jalaliFormatter(options);
  if (getLocale() === "fa") return formatter.format(value);
  return formatter
    .formatToParts(value)
    .filter((part) => part.type !== "era")
    .map((part) => part.value)
    .join("")
    .replace(/[\s,]+$/, "")
    .trim();
}

export function latinDigits(input: string) {
  return input
    .replace(/[۰-۹]/g, (ch) => String(FA_DIGITS.indexOf(ch)))
    .replace(/[٠-٩]/g, (ch) => String(AR_DIGITS.indexOf(ch)));
}

/** Stored club data (season, invoice periods) uses Persian digits. */
export function localDigits(value: string) {
  return getLocale() === "en" ? latinDigits(value) : value;
}

export function toJalaliInput(value: string | Date) {
  const d = safeDate(value);
  const { jy, jm, jd } = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${String(jy).padStart(4, "0")}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

export function parseJalaliInput(input: string): Date | null {
  const digits = latinDigits(input).replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const jy = Number(digits.slice(0, 4));
  const jm = Number(digits.slice(4, 6));
  const jd = Number(digits.slice(6, 8));
  if (!isValidJalaaliDate(jy, jm, jd)) return null;
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return new Date(gy, gm - 1, gd);
}

function safeDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function faDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" },
) {
  return formatJalali(safeDate(value), options);
}

export function formatDay(value: string | Date) {
  return faDate(value);
}

export function formatDateFull(value: string | Date) {
  return faDate(value, { day: "numeric", month: "long", year: "numeric" });
}

export function formatMonthYear(value: string | Date) {
  return faDate(value, { month: "long", year: "numeric" });
}

/** The current Jalali year alone, e.g. `۱۴۰۵` or `1405`, without the `AP` era. */
export function jalaliYear(value: string | Date = new Date()) {
  return formatJalali(safeDate(value), { year: "numeric" });
}

export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat(localeTag(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tehran",
  }).format(safeDate(value));
}

export function shortDayNumber(value: string | Date) {
  return formatJalali(safeDate(value), { day: "numeric" });
}

export function shortMonthName(value: string | Date) {
  return formatJalali(safeDate(value), { month: "short" });
}

export function dayKey(value: string | Date) {
  const d = safeDate(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function relativeDay(value: string | Date, now = new Date()) {
  const diff = Math.round(
    (startOfDay(safeDate(value)).getTime() - startOfDay(now).getTime()) / dayMs,
  );
  if (diff === 0) return tr(M.common.today);
  if (diff === 1) return tr(M.common.tomorrow);
  if (diff === -1) return tr(M.common.yesterday);
  if (diff > 1) return tr(M.common.daysAhead, { count: faNum(diff) });
  return tr(M.common.daysAgo, { count: faNum(Math.abs(diff)) });
}

export function timeUntil(value: string | Date, now = new Date()) {
  const diff = safeDate(value).getTime() - now.getTime();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 24) return relativeDay(value, now);
  if (hours > 0) return tr(M.common.hoursAhead, { count: faNum(hours) });
  return tr(M.common.minutesAhead, { count: faNum(Math.max(minutes, 1)) });
}

export function ageFromBirthDate(birthDate: string, now = new Date()) {
  const birth = safeDate(birthDate);
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return Math.max(age, 0);
}

export function toDateInput(value: string | Date) {
  const d = safeDate(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function toTimeInput(value: string | Date) {
  const d = safeDate(value);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function combineDateTime(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0).toISOString();
}

export function startOfMonth(value: string | Date) {
  const d = safeDate(value);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfJalaliMonth(value: string | Date = new Date()) {
  const d = safeDate(value);
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    day: "numeric",
    timeZone: "Asia/Tehran",
  }).formatToParts(d);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 1);
  const start = new Date(d);
  start.setDate(start.getDate() - (day - 1));
  start.setHours(0, 0, 0, 0);
  return start;
}

export function previousJalaliMonth(value: string | Date = new Date()) {
  return new Date(startOfJalaliMonth(value).getTime() - dayMs);
}

export function endOfJalaliMonth(value: string | Date = new Date()) {
  const start = startOfJalaliMonth(value);
  return startOfJalaliMonth(new Date(start.getTime() + 32 * dayMs));
}

export function addJalaliMonths(value: string | Date = new Date(), delta = 0) {
  let cursor = startOfJalaliMonth(value);
  if (delta < 0) {
    for (let i = 0; i > delta; i -= 1) cursor = previousJalaliMonth(cursor);
  } else {
    for (let i = 0; i < delta; i += 1) cursor = endOfJalaliMonth(cursor);
  }
  return cursor;
}

export function daysFromNow(days: number, hour = 12, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
