"use client";

import { useSyncExternalStore } from "react";

export type Locale = "fa" | "en";

const LOCALE_KEY = "valibal-locale-v1";

const listeners = new Set<() => void>();

function readStored(): Locale {
  if (typeof window === "undefined") return "fa";
  try {
    return window.localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "fa";
  } catch {
    return "fa";
  }
}

let current: Locale = readStored();

function applyDocument(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
}

// The prerendered shell is Persian; a stored English choice has to be reflected
// before the first paint so nothing lays out in the wrong direction.
applyDocument(current);

export function getLocale(): Locale {
  return current;
}

export function getDir(locale: Locale = current): "rtl" | "ltr" {
  return locale === "fa" ? "rtl" : "ltr";
}

export function setLocale(next: Locale) {
  if (next === current) return;
  current = next;
  try {
    window.localStorage.setItem(LOCALE_KEY, next);
  } catch {
    // private mode: the choice still applies to this session
  }
  applyDocument(next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => "fa");
}

/** `{name}` placeholders, so each language keeps its own word order. */
export function interp(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}
