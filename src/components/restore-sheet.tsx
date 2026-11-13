"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, FileJson, Loader2, ShieldAlert, Upload, UnlockKeyhole } from "lucide-react";
import { useClub } from "@/lib/store";
import { Button, Field, Input, Sheet } from "@/components/ui";
import { M, tr, useT } from "@/lib/i18n/messages";
import { faNum } from "@/lib/format";
import { decryptBackup } from "@/lib/backup-crypto";
import { isBackupFileSizeAllowed } from "@/lib/offline-storage";
import type { ClubData } from "@/lib/types";

interface BackupSummary {
  name: string;
  sizeKb: number;
  club: string;
  players: number;
  teams: number;
  events: number;
  users: number;
  legacyPlaintext: boolean;
}

function summarise(name: string, size: number, parsed: ClubData, legacyPlaintext: boolean): BackupSummary {
  return {
    name,
    sizeKb: Math.max(1, Math.round(size / 1024)),
    club: parsed.club?.name ?? "",
    players: parsed.players?.length ?? 0,
    teams: parsed.teams?.length ?? 0,
    events: parsed.events?.length ?? 0,
    users: parsed.users?.length ?? 0,
    legacyPlaintext,
  };
}

function validClubData(value: unknown): value is ClubData {
  return Boolean(
    value && typeof value === "object" && "club" in value && "users" in value &&
    Array.isArray((value as { users?: unknown }).users),
  );
}

export function RestoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { restoreBackup, toast } = useClub();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileText, setFileText] = useState("");
  const [raw, setRaw] = useState("");
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileSize, setSelectedFileSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFileText("");
    setRaw("");
    setSummary(null);
    setUnlockPassword("");
    setManagerPassword("");
    setError(null);
    setUnlockBusy(false);
    setBusy(false);
  }, [open]);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setRaw("");
    setSummary(null);
    setFileText("");
    setError(null);
    if (!isBackupFileSizeAllowed(file.size)) {
      setFileText("");
      setRaw("");
      setSummary(null);
      setError(tr(M.restoreSheet.fileTooLarge));
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    try {
      setFileText(await file.text());
      setRaw("");
      setSummary(null);
      setUnlockPassword("");
      setError(null);
    } catch {
      setFileText("");
      setRaw("");
      setSummary(null);
      setError(tr(M.restoreSheet.readFailed));
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const unlock = async () => {
    if (!fileText) {
      setError(tr(M.restoreSheet.fileRequired));
      return;
    }
    setUnlockBusy(true);
    setError(null);
    try {
      let decoded: unknown;
      let legacyPlaintext = false;
      try {
        const clearText = await decryptBackup(fileText, unlockPassword);
        const envelope = JSON.parse(clearText) as { format?: string; version?: number; data?: unknown };
        if (envelope.format === "setaregan-club-data" && envelope.version === 1) {
          decoded = envelope.data;
        } else {
          decoded = envelope;
        }
      } catch {
        // Earlier releases emitted unencrypted JSON. Keep a one-way import path so
        // customers can restore those files, but label the risk before proceeding.
        const legacy = JSON.parse(fileText) as unknown;
        if (!validClubData(legacy)) throw new Error("not a backup");
        decoded = legacy;
        legacyPlaintext = true;
      }
      if (!validClubData(decoded)) throw new Error("not a backup");
      const data = decoded as ClubData;
      setRaw(JSON.stringify(data));
      setSummary(summarise(
        selectedFileName,
        selectedFileSize,
        data,
        legacyPlaintext,
      ));
    } catch {
      setRaw("");
      setSummary(null);
      setError(tr(M.backupSheet.wrongPassword));
    } finally {
      setUnlockBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!raw) {
      setError(tr(M.backupSheet.locked));
      return;
    }
    setBusy(true);
    const result = await restoreBackup({ raw, password: managerPassword });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? tr(M.restoreSheet.readFailed));
      return;
    }
    toast(result.message ?? "", "info");
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(M.restoreSheet.title)}
      description={t(M.restoreSheet.description)}
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="restore-form" className="flex-1" disabled={busy || !raw}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
            {t(M.restoreSheet.submit)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="restore-form" onSubmit={submit} className="space-y-4">
        {error ? (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[11px] leading-5 text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json,application/octet-stream,.clubbackup"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              setSelectedFileName(file.name);
              setSelectedFileSize(file.size);
              void pickFile(file);
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="w-full">
          <Upload className="h-4 w-4" />
          {summary ? t(M.restoreSheet.changeFile) : t(M.restoreSheet.chooseFile)}
        </Button>

        {fileText && !raw ? (
          <>
            <Field label={t(M.backupSheet.unlockLabel)} hint={t(M.backupSheet.locked)}>
              <Input
                type="password"
                autoComplete="current-password"
                value={unlockPassword}
                onChange={(event) => setUnlockPassword(event.target.value)}
                dir="ltr"
                className="text-right ltr:text-left"
              />
            </Field>
            <Button type="button" variant="outline" onClick={() => void unlock()} disabled={unlockBusy} className="w-full">
              {unlockBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UnlockKeyhole className="h-4 w-4" />}
              {t(M.backupSheet.unlock)}
            </Button>
          </>
        ) : null}

        {summary ? (
          <div className="space-y-2 rounded-2xl bg-canvas/70 px-3.5 py-3 text-[11px] leading-5 text-ink-soft ring-1 ring-line/60">
            <p dir="ltr" className="truncate text-right font-mono text-[10px] text-muted ltr:text-left">
              {t(M.restoreSheet.fileSummary, {
                name: summary.name,
                size: faNum(summary.sizeKb),
              })}
            </p>
            <p>{t(M.restoreSheet.contents, {
              club: summary.club || "—",
              players: faNum(summary.players),
              teams: faNum(summary.teams),
              events: faNum(summary.events),
              users: faNum(summary.users),
            })}</p>
            {summary.legacyPlaintext ? (
              <p className="font-semibold text-amber-700">{t(M.restoreSheet.legacyWarning)}</p>
            ) : null}
          </div>
        ) : null}

        {summary ? (
          <Field label={t(M.backupSheet.managerPasswordLabel)} hint={t(M.backupSheet.managerPasswordHint)}>
            <Input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={managerPassword}
              onChange={(event) => setManagerPassword(event.target.value)}
              placeholder={t(M.passwordSheet.minSix)}
              dir="ltr"
              className="text-right ltr:text-left"
            />
          </Field>
        ) : null}

        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[10px] leading-5 text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p>{t(M.restoreSheet.warning)}</p>
            <p>{t(M.restoreSheet.otherUsersNote)}</p>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
