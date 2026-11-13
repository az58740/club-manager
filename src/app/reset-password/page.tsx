"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { useClub } from "@/lib/store";
import { useDocumentTitle } from "@/lib/use-document-title";
import { Button, Card, Field, Input, PageHeader, Splash } from "@/components/ui";
import { M, tr, useT } from "@/lib/i18n/messages";

export default function ResetPasswordPage() {
  const { ready, authMode, completePasswordReset } = useClub();
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useDocumentTitle(t(M.resetPassword.docTitle));

  if (!ready) return <Splash />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setNotice({ tone: "error", text: t(M.resetPassword.mismatch) });
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await completePasswordReset(password);
    setBusy(false);
    setNotice({
      tone: result.ok ? "success" : "error",
      text: result.message ?? t(M.resetPassword.failed),
    });
    if (result.ok) {
      setPassword("");
      setConfirm("");
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-night-900 px-4 py-10">
      <div className="w-full max-w-md">
        <Card className="p-6">
          <PageHeader
            title={t(M.resetPassword.title)}
            subtitle={
              authMode === "supabase"
                ? t(M.resetPassword.subtitleCloud)
                : t(M.resetPassword.subtitleDemo)
            }
          />

          {authMode !== "supabase" ? (
            <div className="mt-5 space-y-4">
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-3 text-[12px] leading-6 text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {t(M.resetPassword.cloudNoteLead)}{" "}
                <span className="font-mono text-[10px]">.env.local</span>{" "}
                {t(M.resetPassword.cloudNoteTail)}
              </div>
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600"
              >
                <ArrowLeft className="h-4 w-4 ltr:rotate-180" />
                {t(M.resetPassword.backToLogin)}
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              {notice ? (
                <div
                  className={
                    notice.tone === "success"
                      ? "flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] leading-5 text-emerald-700"
                      : "flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[11px] leading-5 text-rose-700"
                  }
                >
                  {notice.tone === "success" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  {notice.text}
                </div>
              ) : null}
              <Field label={t(M.passwordSheet.newLabel)} hint={t(M.passwordSheet.minSix)}>
                <Input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
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
              <Button type="submit" className="w-full" disabled={busy || notice?.tone === "success"}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                {t(M.passwordSheet.submit)}
              </Button>
              {notice?.tone === "success" ? (
                <Link
                  href="/login"
                  className="flex items-center justify-center gap-1 text-[12px] font-medium text-brand-600"
                >
                  {t(M.resetPassword.signInNew)}
                  <ArrowLeft className="h-4 w-4 ltr:rotate-180" />
                </Link>
              ) : null}
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
