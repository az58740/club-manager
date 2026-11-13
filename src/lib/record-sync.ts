import { api, post, type ApiClub } from "./api";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./supabase";
import type { ClubData, ClubProfile } from "./types";

/**
 * Every collection of ClubData that is shared between the phones of one club.
 * `users` is intentionally excluded: accounts live in their own table on the
 * server so a synced row or a backup file can never carry a password hash.
 */
export type SharedEntity =
  | "club"
  | "teams"
  | "players"
  | "events"
  | "attendance"
  | "stats"
  | "invoices"
  | "payments"
  | "categories"
  | "accounts"
  | "transactions"
  | "products"
  | "stockMovements";

export const SHARED_ENTITIES: SharedEntity[] = [
  "club",
  "teams",
  "players",
  "events",
  "attendance",
  "stats",
  "invoices",
  "payments",
  "categories",
  "accounts",
  "transactions",
  "products",
  "stockMovements",
];

export type RecordKey = `${SharedEntity}:${string}`;

export interface LocalRecord {
  entity: SharedEntity;
  id: string;
  payload: unknown;
}

/** One row of the server's record spine, exactly as /v1/sync answers it. */
export interface RemoteRow {
  entity: string;
  id: string;
  payload: unknown;
  deleted: boolean;
  hash: string;
  seq: number;
}

export interface ChangeSet {
  changed: LocalRecord[];
  removed: { entity: SharedEntity; id: string }[];
}

/**
 * Last server state this device has seen, used to spot local edits made offline.
 * `h` is this device's own fingerprint, never the server hash: the two use
 * different algorithms and are not comparable.
 */
export interface SeenEntry {
  seq: number;
  h: string;
}

export type SeenMap = Record<string, SeenEntry>;

export interface SharedClub {
  id: string;
  name: string;
  shortName: string;
  inviteCode: string;
}

export type SyncStatus = "off" | "connecting" | "syncing" | "synced" | "offline" | "error";

export interface SyncState {
  status: SyncStatus;
  clubId: string | null;
  clubName: string | null;
  inviteCode: string | null;
  lastSyncAt: string | null;
  error: string | null;
  pendingCount: number;
}

export const EMPTY_SYNC_STATE: SyncState = {
  status: "off",
  clubId: null,
  clubName: null,
  inviteCode: null,
  lastSyncAt: null,
  error: null,
  pendingCount: 0,
};

export function recordKey(entity: SharedEntity, id: string): RecordKey {
  return `${entity}:${id}`;
}

/** Flattens the club state into one record per entity row, plus the club profile. */
export function flattenData(data: ClubData): Map<RecordKey, LocalRecord> {
  const map = new Map<RecordKey, LocalRecord>();
  map.set("club:club", { entity: "club", id: "club", payload: data.club });

  for (const entity of SHARED_ENTITIES) {
    if (entity === "club") continue;
    const rows = data[entity] as { id: string }[] | undefined;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      map.set(recordKey(entity, row.id), { entity, id: row.id, payload: row });
    }
  }
  return map;
}

function samePayload(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Cheap content fingerprint used only to tell an untouched local row from one
 * this device edited while offline.
 */
export function hashPayload(payload: unknown): string {
  const text = JSON.stringify(payload) ?? "";
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return `${(hash >>> 0).toString(36)}.${text.length.toString(36)}`;
}

export function diffData(
  previous: Map<RecordKey, LocalRecord>,
  next: Map<RecordKey, LocalRecord>,
): ChangeSet {
  const changed: LocalRecord[] = [];
  const removed: { entity: SharedEntity; id: string }[] = [];

  for (const [key, record] of next) {
    const before = previous.get(key);
    if (!before || !samePayload(before.payload, record.payload)) changed.push(record);
  }
  for (const [key, record] of previous) {
    if (!next.has(key)) removed.push({ entity: record.entity, id: record.id });
  }
  return { changed, removed };
}

export function changeSetSize(changes: ChangeSet) {
  return changes.changed.length + changes.removed.length;
}

function applyRow(data: ClubData, row: RemoteRow): ClubData {
  const entity = row.entity as SharedEntity;
  if (!SHARED_ENTITIES.includes(entity)) return data;

  if (entity === "club") {
    return row.deleted ? data : { ...data, club: row.payload as ClubProfile };
  }

  const rows = data[entity] as { id: string }[] | undefined;
  if (!Array.isArray(rows)) return data;

  const next = row.deleted
    ? rows.filter((item) => item.id !== row.id)
    : rows.some((item) => item.id === row.id)
      ? rows.map((item) => (item.id === row.id ? row.payload : item))
      : [...rows, row.payload];

  return { ...data, [entity]: next } as ClubData;
}

/** Applies server rows on top of the local state (newer rows win). */
export function applyRows(data: ClubData, rows: RemoteRow[]): ClubData {
  return rows.reduce(applyRow, data);
}

/**
 * Mirrors a server row into the "last synced" snapshot without touching the
 * live data, so local edits made at the same moment still show up as changes.
 */
export function applyRowToSnapshot(
  snapshot: Map<RecordKey, LocalRecord>,
  row: RemoteRow,
) {
  const entity = row.entity as SharedEntity;
  if (!SHARED_ENTITIES.includes(entity)) return;
  const key = recordKey(entity, row.id);
  if (row.deleted) snapshot.delete(key);
  else snapshot.set(key, { entity, id: row.id, payload: row.payload });
}

/* ------------------------------- club API ------------------------------- */

interface WireChange {
  entity: SharedEntity;
  id: string;
  payload: unknown;
  deleted?: boolean;
}

interface PushReport {
  applied: RemoteRow[];
  head: number;
}

interface PullPage {
  records: RemoteRow[];
  cursor: number;
  hasMore: boolean;
}

export interface PullResult {
  rows: RemoteRow[];
  cursor: number;
}

// A hosted API refuses bodies over a few megabytes, and a roster row can carry
// a photo, so a batch is bounded by bytes as well as by row count.
const PUSH_BATCH_ROWS = 200;
const PUSH_BATCH_BYTES = 3_000_000;

/**
 * Uploads local edits. The op id is left out on purpose: the server derives it
 * from this device, the row and the payload, so a retry after a dropped
 * connection is a no-op instead of a second write.
 */
export async function pushChanges(changes: ChangeSet): Promise<RemoteRow[]> {
  const rows: WireChange[] = [
    ...changes.changed.map((record) => ({
      entity: record.entity,
      id: record.id,
      payload: record.payload,
    })),
    ...changes.removed.map((record) => ({
      entity: record.entity,
      id: record.id,
      payload: null,
      deleted: true,
    })),
  ];
  if (!rows.length) return [];

  const pushed: RemoteRow[] = [];
  let batch: WireChange[] = [];
  let bytes = 0;

  const flush = async () => {
    if (!batch.length) return;
    const report = await post<PushReport>("/v1/sync/push", { changes: batch });
    pushed.push(...(report.applied ?? []));
    batch = [];
    bytes = 0;
  };

  for (const row of rows) {
    const size = JSON.stringify(row).length;
    if (batch.length && (batch.length >= PUSH_BATCH_ROWS || bytes + size > PUSH_BATCH_BYTES)) {
      await flush();
    }
    batch.push(row);
    bytes += size;
  }
  await flush();
  return pushed;
}

/** Everything this role may read that changed after the cursor it already has. */
export async function pullRecords(cursor: number): Promise<PullResult> {
  const rows: RemoteRow[] = [];
  let next = cursor;
  for (;;) {
    const page = await api<PullPage>(`/v1/sync/pull?cursor=${next}&limit=500`);
    rows.push(...(page.records ?? []));
    next = page.cursor;
    if (!page.hasMore) break;
  }
  return { rows, cursor: next };
}

/** First contact: the whole visible club in one answer, with its head cursor. */
export async function fetchSnapshot(): Promise<PullResult> {
  const page = await api<PullPage>("/v1/sync/snapshot");
  return { rows: page.records ?? [], cursor: page.cursor ?? 0 };
}

function mapClub(row: ApiClub): SharedClub {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName ?? "",
    inviteCode: row.inviteCode ?? "",
  };
}

export async function fetchSharedClub(): Promise<SharedClub | null> {
  const club = await api<ApiClub>("/v1/clubs/current");
  return club?.id ? mapClub(club) : null;
}

export async function joinSharedClub(code: string): Promise<SharedClub> {
  return mapClub(await post<ApiClub>("/v1/clubs/join", { code }));
}

export async function rotateClubCode(): Promise<string> {
  const result = await post<{ inviteCode: string }>("/v1/clubs/invite-code/rotate");
  return result.inviteCode ?? "";
}

interface RealtimeGrant {
  enabled: boolean;
  token?: string;
  expiresAt?: string;
}

let grant: { token: string; expiresAt: number } | null = null;

/**
 * Supabase asks for the token again on every heartbeat, so it is cached and
 * renewed a minute before it expires rather than fetched per heartbeat.
 */
async function realtimeToken(): Promise<string | null> {
  if (grant && grant.expiresAt - Date.now() > 60_000) return grant.token;
  const answer = await api<RealtimeGrant>("/v1/realtime/token");
  if (!answer.enabled || !answer.token) {
    grant = null;
    return null;
  }
  grant = { token: answer.token, expiresAt: Date.parse(answer.expiresAt ?? "") };
  return grant.token;
}

/**
 * Rings when another phone writes. The payload is deliberately ignored: the row
 * policy on the socket and the read scope on the API are the same rule, but only
 * the API is authoritative, so a ring means "pull now", never "apply this".
 * Without a Supabase project the grant comes back disabled and the app polls.
 */
export function subscribeRecords(clubId: string, onRing: () => void): () => void {
  let disposed = false;
  let stop: (() => void) | null = null;

  void (async () => {
    if (!isSupabaseConfigured) return;
    const token = await realtimeToken().catch(() => null);
    if (disposed || !token) return;

    const { createClient } = await import("@supabase/supabase-js");
    if (disposed) return;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      accessToken: () => realtimeToken().catch(() => null),
    });
    const channel = supabase
      .channel(`record-state-${clubId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "record_state",
          filter: `club_id=eq.${clubId}`,
        },
        () => onRing(),
      )
      .subscribe();

    stop = () => {
      void supabase.removeChannel(channel);
    };
  })().catch(() => undefined);

  return () => {
    disposed = true;
    stop?.();
  };
}

/* ----------------------------- local queue ---------------------------- */

// The queue key stays at v2: its rows are the same shape, so an edit made
// offline before this transport landed is still delivered instead of orphaned.
const PENDING_KEY = "valibal-club-pending-v2";
const SEEN_KEY = "valibal-club-seen-v3";
const CURSOR_KEY = "valibal-club-cursor-v1";

export interface PendingState {
  records: Record<string, LocalRecord>;
  removed: Record<string, { entity: SharedEntity; id: string }>;
}

export function countPending(pending: PendingState) {
  return Object.keys(pending.records).length + Object.keys(pending.removed).length;
}

export function loadPending(clubId: string): PendingState {
  try {
    const raw = localStorage.getItem(`${PENDING_KEY}:${clubId}`);
    if (!raw) return { records: {}, removed: {} };
    const parsed = JSON.parse(raw) as PendingState;
    return {
      records: parsed.records ?? {},
      removed: parsed.removed ?? {},
    };
  } catch {
    return { records: {}, removed: {} };
  }
}

export function savePending(pending: PendingState, clubId: string) {
  try {
    if (!countPending(pending)) {
      localStorage.removeItem(`${PENDING_KEY}:${clubId}`);
      return;
    }
    localStorage.setItem(`${PENDING_KEY}:${clubId}`, JSON.stringify(pending));
  } catch {
    // storage can be unavailable; the change is still in memory
  }
}

export function mergePending(pending: PendingState, changes: ChangeSet): PendingState {
  const records = { ...pending.records };
  const removed = { ...pending.removed };

  for (const record of changes.changed) {
    const key = recordKey(record.entity, record.id);
    records[key] = record;
    delete removed[key];
  }
  for (const record of changes.removed) {
    const key = recordKey(record.entity, record.id);
    delete records[key];
    removed[key] = record;
  }
  return { records, removed };
}

export function pendingToChangeSet(pending: PendingState): ChangeSet {
  return {
    changed: Object.values(pending.records),
    removed: Object.values(pending.removed),
  };
}

export function loadSeen(clubId: string): SeenMap {
  try {
    const raw = localStorage.getItem(`${SEEN_KEY}:${clubId}`);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

export function saveSeen(seen: SeenMap, clubId: string) {
  try {
    localStorage.setItem(`${SEEN_KEY}:${clubId}`, JSON.stringify(seen));
  } catch {
    // ignore
  }
}

/** How far into the server's history this device has already read. */
export function loadCursor(clubId: string): number {
  try {
    const value = Number(localStorage.getItem(`${CURSOR_KEY}:${clubId}`));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveCursor(clubId: string, cursor: number) {
  try {
    localStorage.setItem(`${CURSOR_KEY}:${clubId}`, String(cursor));
  } catch {
    // ignore
  }
}

/** Drops everything this device remembers about a club it no longer belongs to. */
export function forgetClub(clubId: string) {
  try {
    localStorage.removeItem(`${PENDING_KEY}:${clubId}`);
    localStorage.removeItem(`${SEEN_KEY}:${clubId}`);
    localStorage.removeItem(`${CURSOR_KEY}:${clubId}`);
  } catch {
    // ignore
  }
}
