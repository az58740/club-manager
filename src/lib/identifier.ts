import { latinDigits } from "./date";
import type { AppUser } from "./types";

/**
 * Sign-in is keyed on email alone. The mobile number is contact information the
 * manager keeps on the account, so it is normalised here too — Persian digits,
 * spaces and the +98 prefix all arrive from the keyboard in different shapes.
 */

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/** `0912 341 8820`, `۰۹۱۲۳۴۱۸۸۲۰`, `+98 912 341 8820` → `09123418820`; anything else → "". */
export function normalizePhone(value: string) {
  const digits = latinDigits(value).replace(/\D/g, "");
  if (!digits) return "";
  const withoutCountry = digits.startsWith("0098")
    ? digits.slice(4)
    : digits.startsWith("98") && digits.length > 11
      ? digits.slice(2)
      : digits;
  const local = withoutCountry.replace(/^0+/, "");
  return /^9\d{9}$/.test(local) ? `0${local}` : "";
}

/** The stored form of a typed address, or "" when it is not an email. */
export function signInEmail(raw: string) {
  const email = normalizeEmail(raw);
  return email.includes("@") && email.includes(".", email.indexOf("@")) ? email : "";
}

export function findUserByEmail(users: AppUser[], raw: string) {
  const email = signInEmail(raw);
  if (!email) return null;
  return users.find((user) => normalizeEmail(user.email) === email) ?? null;
}

export function emailTaken(users: AppUser[], raw: string) {
  const email = signInEmail(raw);
  if (!email) return false;
  return users.some((user) => normalizeEmail(user.email) === email);
}
