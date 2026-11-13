"use client";

import { useEffect, useState } from "react";
import { AlertCircle, KeyRound, Loader2 } from "lucide-react";
import { useClub } from "@/lib/store";
import { Button, Field, Input, Sheet } from "@/components/ui";
import { M, tr, useT } from "@/lib/i18n/messages";

export function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { changePassword, authMode, toast } = useClub();
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    setBusy(false);
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError(tr(M.passwordSheet.mismatch));
      return;
    }
    setBusy(true);
    const result = await changePassword(current, next);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? tr(M.passwordSheet.failed));
      return;
    }
    toast(result.message ?? t(M.passwordSheet.done));
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(M.passwordSheet.title)}
      description={
        authMode === "cloud"
          ? t(M.passwordSheet.descCloud)
          : t(M.passwordSheet.descDemo)
      }
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="password-form" className="flex-1" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {t(M.passwordSheet.submit)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="password-form" onSubmit={submit} className="space-y-4">
        {error ? (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[11px] leading-5 text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}
        <Field label={t(M.passwordSheet.currentLabel)}>
          <Input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            dir="ltr"
            className="text-right ltr:text-left"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(M.passwordSheet.newLabel)} hint={t(M.passwordSheet.minSix)}>
            <Input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              dir="ltr"
              className="text-right ltr:text-left"
            />
          </Field>
          <Field label={t(M.passwordSheet.repeatLabel)}>
            <Input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              dir="ltr"
              className="text-right ltr:text-left"
            />
          </Field>
        </div>
      </form>
    </Sheet>
  );
}
