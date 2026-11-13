import { M, tr } from "./i18n/messages";

/**
 * The club API is the only place accounts and records live. Supabase is still
 * used, but only as the doorbell that tells a phone to pull; every read and
 * write goes through here so one rule set decides what a role may see.
 */
export const apiBase = (process.env.NEXT_PUBLIC_API_BASE ?? "").trim().replace(/\/+$/, "");
export const isApiConfigured = Boolean(apiBase);

export type ApiRole = "manager" | "coach" | "player";
export type ApiUserStatus = "active" | "pending" | "rejected";

export interface ApiUser {
  id: string;
  clubId?: string;
  name: string;
  email: string;
  phone?: string;
  role: ApiRole;
  status: ApiUserStatus;
  teamId?: string;
  playerId?: string;
  requestNote?: string;
  photo?: string;
  emailSeen: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface ApiSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: ApiUser | null;
}

export interface ApiClub {
  id: string;
  name: string;
  shortName?: string;
  sport?: string;
  inviteCode?: string;
  city?: string;
  season?: string;
  phone?: string;
  founded?: string;
  logo?: string;
}

const SESSION_KEY = "valibal-cloud-session-v1";
const DEVICE_KEY = "valibal-device-id-v1";

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // private mode can refuse storage; the session still lives in memory
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly current?: unknown,
    /** The server's own wording, so callers branch on a code, not on a translation. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * The id travels with every write so the server can tell a retry from a second
 * edit. It is minted once per browser and never derived from the account, so
 * signing out and back in on the same phone keeps the same idempotency keys.
 */
let device: string | null = readStorage(DEVICE_KEY);

export function deviceId(): string {
  if (!device) {
    device =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    writeStorage(DEVICE_KEY, device);
  }
  return device;
}

function parseSession(raw: string | null): ApiSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ApiSession;
    return parsed?.accessToken && parsed?.refreshToken ? parsed : null;
  } catch {
    return null;
  }
}

let session: ApiSession | null = parseSession(readStorage(SESSION_KEY));
const listeners = new Set<(next: ApiSession | null) => void>();

export function getSession(): ApiSession | null {
  return session;
}

export function setSession(next: ApiSession | null) {
  session = next;
  writeStorage(SESSION_KEY, next ? JSON.stringify(next) : null);
  for (const listener of listeners) listener(next);
}

export function onSessionChange(listener: (next: ApiSession | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The server answers in English; the club reads Persian. */
function serverMessage(status: number, message: string): string {
  const text = message.toLowerCase();
  if (text.includes("email or password is wrong")) return tr(M.store.badCredentials);
  if (text.includes("has not approved this account")) return tr(M.store.pendingApproval);
  if (text.includes("was rejected") || text.includes("is not active")) {
    return tr(M.store.rejectedAccess);
  }
  if (text.includes("confirm your email")) return tr(M.cloud.emailUnconfirmed);
  if (text.includes("already exists") || text.includes("already registered")) {
    return tr(M.cloud.alreadyRegistered);
  }
  if (text.includes("password must be at least")) return tr(M.cloud.passwordTooShort);
  if (text.includes("current password is wrong")) return tr(M.store.wrongCurrentPassword);
  if (text.includes("already hosts a club")) return tr(M.store.bootstrapAlreadyDone);
  if (text.includes("invite code")) return tr(M.cloud.inviteCodeRejected);
  if (status === 401) return tr(M.cloud.sessionExpired);
  if (status === 403) return tr(M.store.managerOnly);
  if (status === 404) return tr(M.store.userNotFound);
  if (status >= 500) return tr(M.cloud.serverFailed);
  return message || tr(M.cloud.serverFailed);
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** False for the calls that establish a session rather than use one. */
  auth?: boolean;
}

async function send(
  path: string,
  method: string,
  body: unknown,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { "X-Device-Id": deviceId() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(tr(M.cloud.serverUnreachable), 0);
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function runRefresh(): Promise<boolean> {
  const refreshToken = session?.refreshToken;
  if (!refreshToken) return false;
  let response: Response;
  try {
    response = await fetch(`${apiBase}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId() },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
  } catch {
    // Offline is not a sign-out: keep the session so the queue can drain later.
    return false;
  }
  const next = (await response.json().catch(() => null)) as ApiSession | null;
  if (!response.ok || !next?.accessToken || !next.refreshToken) {
    if (response.status === 401 || response.status === 403) setSession(null);
    return false;
  }
  setSession(next);
  return true;
}

/** One refresh at a time: a burst of 401s must not rotate the token twice. */
function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = runRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  if (!isApiConfigured) throw new ApiError(tr(M.sync.notConfigured), 0);

  let response = await send(path, method, body, auth ? (session?.accessToken ?? null) : null);
  if (response.status === 401 && auth && session?.refreshToken && (await refreshSession())) {
    response = await send(path, method, body, session?.accessToken ?? null);
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; current?: unknown }
    | null;
  if (!response.ok) {
    const status = response.status;
    const detail = payload?.error ?? "";
    if (status === 401 && auth) setSession(null);
    throw new ApiError(serverMessage(status, detail), status, payload?.current, detail);
  }
  return payload as T;
}

export function post<T>(path: string, body?: unknown, auth = true): Promise<T> {
  return api<T>(path, { method: "POST", body, auth });
}