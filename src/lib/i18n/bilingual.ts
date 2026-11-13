import { getLocale, type Locale } from "./locale";

/**
 * A label table that answers in the language the user picked, so existing
 * `ROLE_LABELS[user.role]` call sites keep working after a language switch.
 */
export type Bi = { fa: string; en: string };

export function bilingual<K extends string>(entries: Record<K, Bi>): Record<K, string> {
  const value = (key: string) => {
    const entry = entries[key as K];
    if (!entry) return undefined;
    return entry[getLocale() as Locale];
  };

  return new Proxy({} as Record<K, string>, {
    get: (_target, key) => (typeof key === "string" ? value(key) : undefined),
    has: (_target, key) => typeof key === "string" && key in entries,
    ownKeys: () => Reflect.ownKeys(entries),
    getOwnPropertyDescriptor: (_target, key) =>
      typeof key === "string" && key in entries
        ? { enumerable: true, configurable: true, value: value(key) }
        : undefined,
  });
}

export function bi(fa: string, en: string): Bi {
  return { fa, en };
}
