import type { AppUser } from "./types";

const CREDENTIALS_KEY = "valibal-club-credentials-v1";

export const DEMO_PASSWORD = "123456";

interface LocalCredential {
  userId: string;
  salt: string;
  hash: string;
  updatedAt: string;
}

function readCredentials(): LocalCredential[] {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalCredential[]) : [];
  } catch {
    return [];
  }
}

function writeCredentials(rows: LocalCredential[]) {
  try {
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(rows));
  } catch {
    // storage may be unavailable in private mode; password login is a demo feature
  }
}

function randomHex(bytes: number) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt: string) {
  const payload = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function setLocalPassword(userId: string, password: string) {
  const salt = randomHex(12);
  const hash = await hashPassword(password, salt);
  const rows = readCredentials().filter((row) => row.userId !== userId);
  rows.push({ userId, salt, hash, updatedAt: new Date().toISOString() });
  writeCredentials(rows);
}

export async function verifyLocalPassword(userId: string, password: string) {
  const credential = readCredentials().find((row) => row.userId === userId);
  if (!credential) return false;
  const hash = await hashPassword(password, credential.salt);
  return hash === credential.hash;
}

export function hasLocalPassword(userId: string) {
  return readCredentials().some((row) => row.userId === userId);
}

export async function ensureLocalCredentials(users: AppUser[]) {
  if (typeof crypto === "undefined" || !crypto.subtle) return;
  const rows = readCredentials();
  const existing = new Set(rows.map((row) => row.userId));
  const missing = users.filter((user) => user.status !== "rejected" && !existing.has(user.id));
  for (const user of missing) {
    await setLocalPassword(user.id, DEMO_PASSWORD);
  }
}

export function clearLocalCredentials() {
  try {
    localStorage.removeItem(CREDENTIALS_KEY);
  } catch {
    // ignore storage failures
  }
}

/** Drops hashes for accounts the device no longer has, e.g. after a restore. */
export function pruneLocalCredentials(userIds: string[]) {
  const kept = new Set(userIds);
  writeCredentials(readCredentials().filter((row) => kept.has(row.userId)));
}

export function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 8; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}
