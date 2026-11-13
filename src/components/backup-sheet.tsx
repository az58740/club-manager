"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Download, Loader2, LockKeyhole, Share2, ShieldAlert } from "lucide-react";
import { Button, Field, Input, Sheet } from "@/components/ui";
import { useClub } from "@/lib/store";
import { encryptBackup } from "@/lib/backup-crypto";
import type { ClubData } from "@/lib/types";
import { M, useT } from "@/lib/i18n/messages";

export function BackupSheet({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: ClubData;
}) {
  const t = useT();
  const { toast } = useClub();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setDownloadName("");
    setBackupFile(null);
    setPassword("");
    setRepeat("");
    setError(null);
    setBusy(false);
  }, [open]);

  const createBackup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError(t(M.backupSheet.passwordShort));
      return;
    }
    if (password !== repeat) {
      setError(t(M.backupSheet.passwordMismatch));
      return;
    }
    setBusy(true);
    try {
      const content = JSON.stringify({
        format: "setaregan-club-data",
        version: 1,
        createdAt: new Date().toISOString(),
        data,
      });
      const encrypted = await encryptBackup(content, password);
      const blob = new Blob([encrypted], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const fileName = data.club.shortName.trim().replace(/[^\p{L}\p{N}-]+/gu, "-") || "club";
      const backupName = `${fileName}-backup-${new Date().toISOString().slice(0, 10)}.clubbackup`;
      setDownloadName(backupName);
      setDownloadUrl(url);
      setBackupFile(new File([blob], backupName, { type: "application/octet-stream" }));
      setPassword("");
      setRepeat("");
      toast(t(M.backupSheet.fileReady), "info");
    } catch {
      setError(t(M.backupSheet.createFailed));
    } finally {
      setBusy(false);
    }
  };

  const shareBackup = async () => {
    if (!backupFile || typeof navigator === "undefined" || !navigator.share) {
      toast(t(M.backupSheet.shareUnavailable), "error");
      return;
    }
    const shareData: ShareData = {
      title: t(M.backupSheet.title),
      text: t(M.backupSheet.shareHelp),
      files: [backupFile],
    };
    if (navigator.canShare && !navigator.canShare(shareData)) {
      toast(t(M.backupSheet.shareUnavailable), "error");
      return;
    }
    try {
      await navigator.share(shareData);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      toast(t(M.backupSheet.shareUnavailable), "error");
    }
  };

  const saveBackup = async () => {
    if (!backupFile) return;
    type SavePickerWindow = Window & {
      showSaveFilePicker?: (options: {
        suggestedName: string;
        types: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<{
        createWritable: () => Promise<{
          write: (file: File) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    };
    const savePicker = (window as SavePickerWindow).showSaveFilePicker;
    if (savePicker) {
      try {
        const handle = await savePicker.call(window, {
          suggestedName: backupFile.name,
          types: [{
            description: "Encrypted club backup",
            accept: { "application/octet-stream": [".clubbackup"] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(backupFile);
        await writable.close();
        toast(t(M.backupSheet.savedDone), "success");
        return;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
      }
    }
    // Browsers without a native save picker use their normal Downloads flow.
    document.getElementById("backup-file-download")?.click();
  };

  const close = () => {
    if (busy) return;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setBackupFile(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t(M.backupSheet.title)}
      description={t(M.backupSheet.description)}
      footer={
        <div className="flex gap-2">
          {!backupFile ? (
            <Button type="submit" form="encrypted-backup-form" className="flex-1" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
              {t(M.backupSheet.submit)}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={close} disabled={busy} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="encrypted-backup-form" onSubmit={createBackup} className="space-y-4">
        {error ? (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[11px] leading-5 text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}
        {backupFile ? (
          <div className="space-y-3">
            <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] leading-5 text-emerald-800">
              {t(M.backupSheet.shareHelp)}
            </p>
            <Button type="button" className="w-full" onClick={shareBackup}>
              <Share2 className="h-4 w-4" />
              {t(M.backupSheet.shareFile)}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={saveBackup}>
              <Download className="h-4 w-4" />
              {t(M.backupSheet.saveFile)}
            </Button>
            {downloadUrl ? (
              <a
                id="backup-file-download"
                href={downloadUrl}
                download={downloadName}
                className="block text-center text-[10px] text-brand-600 underline"
              >
                {t(M.backupSheet.saveFile)}
              </a>
            ) : null}
          </div>
        ) : (
          <>
            <Field label={t(M.backupSheet.passwordLabel)} hint={t(M.backupSheet.passwordHint)}>
              <Input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                dir="ltr"
                className="text-right ltr:text-left"
              />
            </Field>
            <Field label={t(M.backupSheet.repeatLabel)}>
              <Input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                dir="ltr"
                className="text-right ltr:text-left"
              />
            </Field>
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[10px] leading-5 text-amber-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{t(M.backupSheet.warning)}</p>
            </div>
          </>
        )}
      </form>
    </Sheet>
  );
}
