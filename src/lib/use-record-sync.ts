"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClubData } from "./types";
import { M, tr } from "./i18n/messages";
import {
  EMPTY_SYNC_STATE,
  applyRowToSnapshot,
  applyRows,
  changeSetSize,
  countPending,
  diffData,
  fetchSharedClub,
  fetchSnapshot,
  flattenData,
  hashPayload,
  loadCursor,
  loadPending,
  loadSeen,
  mergePending,
  pendingToChangeSet,
  pullRecords,
  pushChanges,
  recordKey,
  saveCursor,
  savePending,
  saveSeen,
  subscribeRecords,
  type LocalRecord,
  type PendingState,
  type RemoteRow,
  type SeenMap,
  type SharedEntity,
  type SyncState,
} from "./record-sync";

interface UseRecordSyncOptions {
  enabled: boolean;
  dataReady: boolean;
  clubId: string | null;
  data: ClubData;
  setData: (updater: (current: ClubData) => ClubData) => void;
}

/** Without a Realtime socket every phone still catches up within this window. */
const POLL_MS = 15_000;
/** One write on another phone can touch many rows; pull once, not once per row. */
const RING_DEBOUNCE_MS = 300;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : tr(M.syncFlow.syncFailed);
}

function offline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export function useRecordSync({
  enabled,
  dataReady,
  clubId,
  data,
  setData,
}: UseRecordSyncOptions) {
  const [state, setState] = useState<SyncState>(EMPTY_SYNC_STATE);

  const dataRef = useRef(data);
  dataRef.current = data;

  const clubIdRef = useRef<string | null>(null);
  const snapshotRef = useRef(flattenData(data));
  const pendingRef = useRef<PendingState>({ records: {}, removed: {} });
  const seenRef = useRef<SeenMap>({});
  const cursorRef = useRef(0);
  const pushTimerRef = useRef<number | null>(null);
  const pushPromiseRef = useRef<Promise<void> | null>(null);
  const pushNowRef = useRef<() => Promise<void>>(async () => undefined);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const ringTimerRef = useRef<number | null>(null);

  const schedulePush = useCallback(() => {
    if (pushTimerRef.current !== null) window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null;
      void pushNowRef.current().catch(() => undefined);
    }, 600);
  }, []);

  const pushNow = useCallback((): Promise<void> => {
    if (pushPromiseRef.current) return pushPromiseRef.current;

    const run = async () => {
      const activeClub = clubIdRef.current;
      if (!activeClub || !countPending(pendingRef.current)) return;
      if (offline()) {
        setState((current) => ({ ...current, status: "offline" }));
        throw new Error(tr(M.syncFlow.offlineQueued));
      }

      const sent = pendingToChangeSet(pendingRef.current);
      try {
        const rows = await pushChanges(sent);
        if (clubIdRef.current !== activeClub) return;

        const hashes = new Map<string, string>();
        for (const record of sent.changed) {
          hashes.set(recordKey(record.entity, record.id), hashPayload(record.payload));
        }
        for (const record of sent.removed) {
          hashes.set(recordKey(record.entity, record.id), hashPayload(null));
        }
        for (const row of rows) {
          const key = recordKey(row.entity as SharedEntity, row.id);
          seenRef.current[key] = {
            seq: row.seq,
            h: hashes.get(key) ?? hashPayload(row.payload),
          };
          if (row.seq > cursorRef.current) cursorRef.current = row.seq;
        }

        const current = pendingRef.current;
        for (const record of sent.changed) {
          const key = recordKey(record.entity, record.id);
          const pendingRecord = current.records[key];
          if (pendingRecord && hashPayload(pendingRecord.payload) === hashes.get(key)) {
            delete current.records[key];
          }
        }
        for (const record of sent.removed) {
          const key = recordKey(record.entity, record.id);
          if (current.removed[key]) delete current.removed[key];
        }

        savePending(pendingRef.current, activeClub);
        saveSeen(seenRef.current, activeClub);
        saveCursor(activeClub, cursorRef.current);
        setState((currentState) => ({
          ...currentState,
          status: "synced",
          error: null,
          lastSyncAt: new Date().toISOString(),
          pendingCount: countPending(pendingRef.current),
        }));

        if (countPending(pendingRef.current)) schedulePush();
      } catch (error) {
        if (clubIdRef.current === activeClub) {
          setState((currentState) => ({
            ...currentState,
            status: offline() ? "offline" : "error",
            error: errorText(error),
          }));
        }
        throw error;
      }
    };

    pushPromiseRef.current = run().finally(() => {
      pushPromiseRef.current = null;
    });
    return pushPromiseRef.current;
  }, [schedulePush]);

  pushNowRef.current = pushNow;

  /**
   * Reads what the server has that this phone does not, then uploads what this
   * phone has that the server does not. An edit made here wins until it is
   * pushed; every other row on the server is newer than what this device last
   * confirmed, so it is applied as it arrives.
   */
  const syncWithServer = useCallback(
    async (activeClub: string) => {
      const page =
        cursorRef.current === 0
          ? await fetchSnapshot()
          : await pullRecords(cursorRef.current);
      if (clubIdRef.current !== activeClub) return;

      const remote = page.rows;
      const remoteMap = new Map<string, RemoteRow>();
      for (const row of remote) {
        remoteMap.set(recordKey(row.entity as SharedEntity, row.id), row);
      }

      const local = flattenData(dataRef.current);
      const pending = pendingRef.current;
      const seen = seenRef.current;
      const keepLocal = new Set<string>(Object.keys(pending.removed));
      const toUpload: LocalRecord[] = [];

      for (const [key, record] of local) {
        if (pending.records[key] || pending.removed[key]) {
          keepLocal.add(key);
          continue;
        }
        const entry = seen[key];
        if (!entry) {
          // Never confirmed by the server: a row this device holds alone.
          if (!remoteMap.has(key)) {
            keepLocal.add(key);
            toUpload.push(record);
          }
          continue;
        }
        if (entry.h !== hashPayload(record.payload)) {
          // Edited on this device since the last confirmed sync.
          keepLocal.add(key);
          toUpload.push(record);
        }
      }

      const fresh = remote.filter((row) => {
        const key = recordKey(row.entity as SharedEntity, row.id);
        if (keepLocal.has(key)) return false;
        const entry = seen[key];
        return !entry || row.seq > entry.seq;
      });

      if (fresh.length) {
        for (const row of fresh) {
          applyRowToSnapshot(snapshotRef.current, row);
          seen[recordKey(row.entity as SharedEntity, row.id)] = {
            seq: row.seq,
            h: hashPayload(row.deleted ? null : row.payload),
          };
        }
        setData((current) => applyRows(current, fresh));
      }

      cursorRef.current = Math.max(cursorRef.current, page.cursor);
      saveCursor(activeClub, cursorRef.current);
      saveSeen(seen, activeClub);

      if (toUpload.length) {
        const records = { ...pendingRef.current.records };
        for (const record of toUpload) {
          records[recordKey(record.entity, record.id)] = record;
        }
        pendingRef.current = { records, removed: pendingRef.current.removed };
        savePending(pendingRef.current, activeClub);
        setState((current) => ({
          ...current,
          pendingCount: countPending(pendingRef.current),
        }));
      }

      await pushNow();
    },
    [pushNow, setData],
  );

  /** A ring, a poll and a manual refresh must not pull the same page twice. */
  const runSync = useCallback(
    (activeClub: string): Promise<void> => {
      if (!syncPromiseRef.current) {
        syncPromiseRef.current = syncWithServer(activeClub).finally(() => {
          syncPromiseRef.current = null;
        });
      }
      return syncPromiseRef.current;
    },
    [syncWithServer],
  );

  /** A pull nobody asked for: it reports trouble, but never interrupts a form. */
  const backgroundSync = useCallback(() => {
    const activeClub = clubIdRef.current;
    if (!activeClub || offline()) return;
    void runSync(activeClub).then(
      () => {
        if (clubIdRef.current !== activeClub) return;
        setState((current) => ({
          ...current,
          status: "synced",
          error: null,
          lastSyncAt: new Date().toISOString(),
          pendingCount: countPending(pendingRef.current),
        }));
      },
      (error: unknown) => {
        if (clubIdRef.current !== activeClub) return;
        setState((current) => ({
          ...current,
          status: offline() ? "offline" : "error",
          error: errorText(error),
        }));
      },
    );
  }, [runSync]);

  const connect = useCallback(
    async (activeClub: string) => {
      clubIdRef.current = activeClub;
      pendingRef.current = loadPending(activeClub);
      seenRef.current = loadSeen(activeClub);
      cursorRef.current = loadCursor(activeClub);
      snapshotRef.current = flattenData(dataRef.current);
      setState({
        status: "connecting",
        clubId: activeClub,
        clubName: null,
        inviteCode: null,
        lastSyncAt: null,
        error: null,
        pendingCount: countPending(pendingRef.current),
      });

      try {
        const club = await fetchSharedClub().catch(() => null);
        if (clubIdRef.current !== activeClub) return;
        setState((current) => ({
          ...current,
          clubName: club?.name ?? null,
          inviteCode: club?.inviteCode ?? null,
        }));

        await runSync(activeClub);
        if (clubIdRef.current !== activeClub) return;
        setState((current) => ({
          ...current,
          status: "synced",
          error: null,
          lastSyncAt: new Date().toISOString(),
        }));
      } catch (error) {
        if (clubIdRef.current === activeClub) {
          setState((current) => ({
            ...current,
            status: offline() ? "offline" : "error",
            error: errorText(error),
          }));
        }
      }
    },
    [runSync],
  );

  // connection lifecycle
  useEffect(() => {
    if (!dataReady) return;
    const activeClub = enabled ? clubId : null;
    if (!activeClub) {
      clubIdRef.current = null;
      pendingRef.current = { records: {}, removed: {} };
      seenRef.current = {};
      cursorRef.current = 0;
      snapshotRef.current = flattenData(dataRef.current);
      setState(EMPTY_SYNC_STATE);
      return;
    }

    void connect(activeClub);

    return () => {
      if (clubIdRef.current === activeClub) {
        clubIdRef.current = null;
        setState(EMPTY_SYNC_STATE);
      }
    };
  }, [dataReady, enabled, clubId, connect]);

  // Another phone wrote: the socket rings and this phone pulls the rows the API
  // says it may read. One write can touch many rows, so rings are collected.
  useEffect(() => {
    if (!dataReady || !enabled || !clubId) return;

    const ring = () => {
      if (ringTimerRef.current !== null) window.clearTimeout(ringTimerRef.current);
      ringTimerRef.current = window.setTimeout(() => {
        ringTimerRef.current = null;
        backgroundSync();
      }, RING_DEBOUNCE_MS);
    };

    const unsubscribe = subscribeRecords(clubId, ring);
    return () => {
      unsubscribe();
      if (ringTimerRef.current !== null) {
        window.clearTimeout(ringTimerRef.current);
        ringTimerRef.current = null;
      }
    };
  }, [dataReady, enabled, clubId, backgroundSync]);

  // The socket is an optimisation, not a dependency: with no Supabase project,
  // or a socket the network dropped, every phone still catches up within a poll.
  useEffect(() => {
    if (!dataReady || !enabled || !clubId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      backgroundSync();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [dataReady, enabled, clubId, backgroundSync]);

  // queue local edits made since the previous commit
  useEffect(() => {
    if (!dataReady) return;
    // Skip effects belonging to a render that has already been superseded.
    if (data !== dataRef.current) return;

    const next = flattenData(data);
    const activeClub = clubIdRef.current;
    if (!activeClub) {
      snapshotRef.current = next;
      return;
    }

    const changes = diffData(snapshotRef.current, next);
    snapshotRef.current = next;
    if (!changeSetSize(changes)) return;

    pendingRef.current = mergePending(pendingRef.current, changes);
    savePending(pendingRef.current, activeClub);
    setState((current) => ({
      ...current,
      pendingCount: countPending(pendingRef.current),
    }));
    schedulePush();
  }, [data, dataReady, schedulePush]);

  const syncNow = useCallback(async () => {
    const activeClub = clubIdRef.current;
    if (!activeClub) return;
    setState((current) => ({ ...current, status: "syncing", error: null }));
    try {
      await runSync(activeClub);
      if (clubIdRef.current !== activeClub) return;
      setState((current) => ({
        ...current,
        status: "synced",
        error: null,
        lastSyncAt: new Date().toISOString(),
        pendingCount: countPending(pendingRef.current),
      }));
    } catch (error) {
      if (clubIdRef.current !== activeClub) return;
      setState((current) => ({
        ...current,
        status: offline() ? "offline" : "error",
        error: errorText(error),
      }));
    }
  }, [runSync]);

  const refreshClubInfo = useCallback(async () => {
    if (!clubIdRef.current) return;
    const club = await fetchSharedClub().catch(() => null);
    if (!club) return;
    setState((current) => ({
      ...current,
      clubName: club.name,
      inviteCode: club.inviteCode,
    }));
  }, []);

  // reconnect when the network comes back, refresh after the app resumes
  useEffect(() => {
    const handleOnline = () => {
      if (clubIdRef.current) void syncNow();
    };
    const handleOffline = () => {
      if (clubIdRef.current) {
        setState((current) => ({ ...current, status: "offline" }));
      }
    };
    let lastResume = 0;
    const handleVisibility = () => {
      if (document.visibilityState !== "visible" || !clubIdRef.current) return;
      // The poll skips hidden tabs, so coming back has to catch up at once.
      if (Date.now() - lastResume < 5_000) return;
      lastResume = Date.now();
      void syncNow();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncNow]);

  useEffect(
    () => () => {
      if (pushTimerRef.current !== null) window.clearTimeout(pushTimerRef.current);
    },
    [],
  );

  return { state, syncNow, refreshClubInfo };
}
