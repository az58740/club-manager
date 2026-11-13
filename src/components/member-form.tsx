"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, Mail, Phone, ShieldCheck } from "lucide-react";
import { useClub } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/labels";
import { Button, Field, Input, Select, Sheet } from "@/components/ui";
import { M, tr, useT } from "@/lib/i18n/messages";

interface Credential {
  name: string;
  email: string;
  phone?: string;
  tempPassword?: string;
  message?: string;
}

export function MemberForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createMember, data, toast } = useClub();
  const t = useT();
  const [role, setRole] = useState<"coach" | "player">("coach");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [teamId, setTeamId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Credential | null>(null);

  useEffect(() => {
    if (!open) return;
    setRole("coach");
    setName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setTeamId("");
    setPlayerId("");
    setError(null);
    setResult(null);
    setBusy(false);
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const response = await createMember({
      name,
      email,
      phone: phone.trim() || undefined,
      role,
      password: password.trim() || undefined,
      teamId: role === "coach" ? teamId || undefined : undefined,
      playerId: role === "player" ? playerId || undefined : undefined,
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.message ?? tr(M.memberForm.createFailed));
      return;
    }
    setResult({
      name: name.trim(),
      email: response.email ?? email.trim(),
      phone: response.phone,
      tempPassword: response.tempPassword,
      message: response.message,
    });
    toast(tr(M.memberForm.created));
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast(t(M.users.copiedToast, { label }), "info");
    } catch {
      toast(t(M.memberForm.copyFailedManual), "error");
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={result ? t(M.memberForm.titleResult) : t(M.memberForm.titleNew)}
      description={result ? t(M.memberForm.descResult) : t(M.memberForm.descNew)}
      footer={
        result ? (
          <Button type="button" className="w-full" onClick={onClose}>
            {t(M.ui.close)}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="submit" form="member-form" className="flex-1" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {busy ? t(M.memberForm.creating) : t(M.memberForm.submit)}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="w-28">
              {t(M.form.cancel)}
            </Button>
          </div>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] leading-5 text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {result.message}
          </div>

          <div className="rounded-2xl border border-line/80 bg-slate-50/80 p-4">
            <p className="text-[11px] text-muted">{t(M.users.userWord)}</p>
            <p className="mt-1 text-[14px] font-bold text-ink">{result.name}</p>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-line/70">
              <Mail className="h-3.5 w-3.5 text-muted" />
              <span className="flex-1 font-mono text-[11px]" dir="ltr">
                {result.email}
              </span>
              <button
                type="button"
                onClick={() => copy(result.email, t(M.users.emailWord))}
                className="text-muted hover:text-ink"
                aria-label={t(M.users.copyEmailAria)}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>

            {result.phone ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-line/70">
                <Phone className="h-3.5 w-3.5 text-muted" />
                <span className="flex-1 font-mono text-[11px]" dir="ltr">
                  {result.phone}
                </span>
                <button
                  type="button"
                  onClick={() => copy(result.phone ?? "", t(M.users.phoneWord))}
                  className="text-muted hover:text-ink"
                  aria-label={t(M.users.copyPhoneAria)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            {result.tempPassword ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-line/70">
                <span className="text-[10px] text-muted">{t(M.users.tempPasswordWord)}</span>
                <span className="flex-1 text-center font-mono text-[13px] font-bold tracking-wider" dir="ltr">
                  {result.tempPassword}
                </span>
                <button
                  type="button"
                  onClick={() => copy(result.tempPassword ?? "", t(M.users.tempPasswordWord))}
                  className="text-muted hover:text-ink"
                  aria-label={t(M.memberForm.copyTempAria)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>

          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-5 text-muted">
            {t(M.memberForm.resultNote)}
          </p>
        </div>
      ) : (
        <form id="member-form" onSubmit={submit} className="space-y-4">
          {error ? (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[11px] leading-5 text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}
          <Field label={t(M.memberForm.roleField)}>
            <Select
              value={role}
              onChange={(event) => setRole(event.target.value === "player" ? "player" : "coach")}
            >
              <option value="coach">{ROLE_LABELS.coach}</option>
              <option value="player">{ROLE_LABELS.player}</option>
            </Select>
          </Field>
          <Field label={t(M.memberForm.nameLabel)}>
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t(M.memberForm.phName)}
            />
          </Field>
          <Field label={t(M.users.emailWord)}>
            <Input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="member@club.ir"
              dir="ltr"
              className="text-right ltr:text-left"
            />
          </Field>
          <Field label={t(M.login.phoneOptional)} hint={t(M.login.phoneHint)}>
            <Input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="09123456789"
              dir="ltr"
              className="text-right ltr:text-left"
            />
          </Field>
          <Field label={t(M.memberForm.tempPasswordField)} hint={t(M.memberForm.tempFieldHint)}>
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t(M.passwordSheet.minSix)}
              dir="ltr"
              className="text-right ltr:text-left"
            />
          </Field>
          {role === "coach" ? (
            <Field label={t(M.memberForm.teamField)}>
              <Select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
                <option value="">{t(M.memberForm.noTeam)}</option>
                {data.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} · {team.ageGroup}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label={t(M.memberForm.playerField)} hint={t(M.memberForm.playerHint)}>
              <Select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>
                <option value="">{t(M.memberForm.noPlayer)}</option>
                {data.players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </form>
      )}
    </Sheet>
  );
}
