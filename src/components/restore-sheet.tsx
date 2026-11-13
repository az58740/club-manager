"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, FileJson, Loader2, ShieldAlert, Upload } from "lucide-react";
import { useClub } from "@/lib/store";
import { Button, Field, Input, Sheet } from "@/components/ui";
import { M, tr, useT } from "@/lib/i18n/messages";
import { faNum } from "@/lib/format";
import type { ClubData } from "@/lib/types";

interface BackupSummary {
  name: string;
  sizeKb: number;
  club: string;
  players: number;
  teams: number;
  events: number;
  users: number;
}

function summarise(file: File, parsed: ClubData): BackupSummary {
  return {
    name: file.name,
    sizeKb: Math.max(1, Math.round(file.size / 1024)),
    club: parsed.club?.name ?? "",
    players: parsed.players?.length ?? 0,
    teams: parsed.teams?.length ?? 0,
    events: parsed.events?.length ?? 0,
    users: parsed.users?.length ?? 0,
  };
}

export function RestoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { restoreBackup, toast } = useClub();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRaw("");
    setSummary(null);
    setPassword("");
    setError(null);
    setBusy(false);
  }, [open]);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    let text = "";
    try {
      text = await file.text();
      const parsed = JSON.parse(text) as ClubData;
      if (!parsed || typeof parsed !== "object" || !parsed.club || !Array.isArray(parsed.users)) {
        setError(tr(M.restoreSheet.emptyFile));
        setRaw("");
        setSummary(null);
        return;
      }
      setRaw(text);
      setSummary(summarise(file, parsed));
      setError(null);
    } catch {
      setRaw("");
      setSummary(null);
      setError(tr(M.restoreSheet.readFailed));
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!raw) {
      setError(tr(M.restoreSheet.fileRequired));
      return;
    }
    setBusy(true);
    const result = await restoreBackup({ raw, password });
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
          <Button type="submit" form="restore-form" className="flex-1" disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileJson className="h-4 w-4" />
            )}
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
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void pickFile(event.target.files?.[0])}
        />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="w-full">
          <Upload className="h-4 w-4" />
          {summary ? t(M.restoreSheet.changeFile) : t(M.restoreSheet.chooseFile)}
        </Button>

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
          </div>
        ) : null}

        <Field label={t(M.restoreSheet.passwordLabel)} hint={t(M.restoreSheet.passwordHint)}>
          <Input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t(M.passwordSheet.minSix)}
            dir="ltr"
            className="text-right ltr:text-left"
          />
        </Field>

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
