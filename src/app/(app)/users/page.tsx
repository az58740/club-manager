"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserCog,
  X,
} from "lucide-react";
import { useClub } from "@/lib/store";
import { formatDateFull } from "@/lib/date";
import { faNum } from "@/lib/format";
import { ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/labels";
import type { AppUser } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Sheet,
  StatCard,
  cn,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { M, tr, useT } from "@/lib/i18n/messages";
import { MemberForm } from "@/components/member-form";

interface Credential {
  name: string;
  email: string;
  tempPassword?: string;
  message?: string;
}

const statusTone = (status: AppUser["status"]) =>
  status === "pending" ? ("amber" as const) : status === "rejected" ? ("rose" as const) : ("emerald" as const);

const roleTone = (role: AppUser["role"]) =>
  role === "manager" ? ("brand" as const) : role === "coach" ? ("violet" as const) : ("slate" as const);

export default function UsersPage() {
  const t = useT();
  const {
    data,
    currentUser,
    authMode,
    isManager,
    directoryUsers,
    pendingUsers,
    refreshDirectory,
    reviewUser,
    linkPlayer,
    resetUserPassword,
    toast,
  } = useClub();
  const [memberOpen, setMemberOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AppUser | null>(null);
  const [linkTarget, setLinkTarget] = useState<AppUser | null>(null);
  const [linkPlayerId, setLinkPlayerId] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [credential, setCredential] = useState<Credential | null>(null);

  useEffect(() => {
    if (authMode !== "cloud" || !isManager) return;
    let active = true;
    refreshDirectory()
      .catch((error: unknown) => {
        if (!active) return;
        toast(
          error instanceof Error ? error.message : tr(M.users.fetchFailed),
          "error",
        );
      });
    return () => {
      active = false;
    };
  }, [authMode, isManager, refreshDirectory, toast]);

  const members = useMemo(
    () =>
      directoryUsers
        .filter((user) => user.status !== "pending")
        .sort((a, b) => {
          const order = { manager: 0, coach: 1, player: 2 };
          return order[a.role] - order[b.role];
        }),
    [directoryUsers],
  );

  const activeCount = directoryUsers.filter((user) => user.status === "active").length;
  const coachCount = directoryUsers.filter(
    (user) => user.role === "coach" && user.status === "active",
  ).length;
  const unlinkedPlayers = directoryUsers.filter(
    (user) => user.role === "player" && !user.playerId,
  ).length;

  if (!isManager) return null;

  const decide = async (user: AppUser, approve: boolean) => {
    setBusyId(user.id);
    const result = await reviewUser(user.id, approve);
    setBusyId(null);
    toast(result.message ?? t(M.users.decisionSaved), result.ok ? "success" : "error");
  };

  const openLink = (user: AppUser) => {
    setLinkTarget(user);
    setLinkPlayerId(user.playerId ?? "");
  };

  const submitLink = async () => {
    if (!linkTarget) return;
    setLinkBusy(true);
    const result = await linkPlayer(linkTarget.id, linkPlayerId);
    setLinkBusy(false);
    toast(result.message ?? t(M.users.actionFailed), result.ok ? "success" : "error");
    if (result.ok) setLinkTarget(null);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshDirectory();
      toast(t(M.users.directoryRefreshed), "info");
    } catch (error) {
      toast(error instanceof Error ? error.message : t(M.users.refreshFailed), "error");
    } finally {
      setRefreshing(false);
    }
  };

  const resetPassword = async (user: AppUser) => {
    setBusyId(user.id);
    const result = await resetUserPassword(user.id);
    setBusyId(null);
    if (!result.ok) {
      toast(result.message ?? t(M.users.actionFailed), "error");
      return;
    }
    setCredential({
      name: user.name,
      email: user.email,
      tempPassword: result.tempPassword,
      message: result.message,
    });
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast(t(M.users.copiedToast, { label }), "info");
    } catch {
      toast(t(M.users.copyFailed), "error");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title={t(M.shell.titleUsers)}
        subtitle={t(M.users.subtitle)}
        action={
          <div className="flex shrink-0 gap-2">
            {authMode === "cloud" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={refresh}
                disabled={refreshing}
                aria-label={t(M.users.refreshAria)}
              >
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setMemberOpen(true)}>
              <Plus className="h-4 w-4" />
              {t(M.users.newMember)}
            </Button>
          </div>
        }
      />

      <section className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <StatCard
          label={t(M.users.activeUsers)}
          value={faNum(activeCount)}
          hint={t(M.users.registeredCount, { count: faNum(members.length) })}
          icon={<UserCheck className="h-4 w-4" />}
          tone="brand"
        />
        <StatCard
          label={t(M.users.pendingCard)}
          value={faNum(pendingUsers.length)}
          hint={pendingUsers.length ? t(M.users.needsReview) : t(M.users.noRequestsChip)}
          icon={<Clock className="h-4 w-4" />}
          tone={pendingUsers.length ? "amber" : "emerald"}
        />
        <StatCard
          label={t(M.users.coachesCard)}
          value={faNum(coachCount)}
          hint={authMode === "demo" ? t(M.users.localAccount) : t(M.users.cloudAccount)}
          icon={<ShieldCheck className="h-4 w-4" />}
          tone="violet"
        />
      </section>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5">
          <div>
            <h2 className="text-[15px] font-bold text-ink">{t(M.users.requestsTitle)}</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {t(M.users.requestsSub)}
            </p>
          </div>
          <Badge tone={pendingUsers.length ? "amber" : "emerald"} dot>
            {pendingUsers.length
              ? t(M.users.pendingCount, { count: faNum(pendingUsers.length) })
              : t(M.users.reviewed)}
          </Badge>
        </div>

        <div className="mt-3 divide-y divide-line/70">
          {pendingUsers.map((user) => (
            <div key={user.id} className="px-4 py-4 sm:px-5">
              <div className="flex items-start gap-3">
                <Avatar name={user.name} src={user.photo} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[13px] font-bold text-ink">{user.name}</p>
                    <Badge tone="violet">{ROLE_LABELS[user.role]}</Badge>
                    <Badge tone="amber">{t(M.sync.statusPending)}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted" dir="ltr">
                    {[user.email, user.phone].filter(Boolean).join(" · ")}
                  </p>
                  {user.requestNote ? (
                    <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-6 text-ink-soft">
                      {user.requestNote}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-[10px] text-muted">
                    {user.createdAt
                      ? t(M.users.requestedOn, { date: formatDateFull(user.createdAt) })
                      : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => decide(user, true)}
                  disabled={busyId === user.id}
                  className="flex-1 sm:flex-none"
                >
                  {busyId === user.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {t(M.users.approveAccess)}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRejectTarget(user)}
                  disabled={busyId === user.id}
                  className="text-rose-600 ring-rose-200 hover:bg-rose-50"
                >
                  <X className="h-3.5 w-3.5" />
                  {t(M.users.rejectRequest)}
                </Button>
              </div>
            </div>
          ))}

          {!pendingUsers.length ? (
            <div className="px-4 py-8 text-center text-[11px] text-muted">
              {t(M.users.noRequestsDesc)}
            </div>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h2 className="text-[15px] font-bold text-ink">{t(M.users.membersTitle)}</h2>
              <p className="mt-0.5 text-[11px] text-muted">{t(M.users.membersSub)}</p>
            </div>
            <span className="text-[10px] text-muted">
              {t(M.users.accountsCount, { count: faNum(members.length) })}
            </span>
          </div>
          <div className="mt-2 divide-y divide-line/70">
            {members.map((user) => {
              const team = user.teamId
                ? data.teams.find((row) => row.id === user.teamId)
                : undefined;
              const linked =
                user.role === "player" && user.playerId
                  ? data.players.find((row) => row.id === user.playerId)
                  : undefined;
              return (
                <div key={user.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar name={user.name} src={user.photo} size="sm" ring={false} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-[12px] font-semibold text-ink">{user.name}</p>
                      <Badge tone={roleTone(user.role)}>{ROLE_LABELS[user.role]}</Badge>
                      {user.role === "player" ? (
                        <Badge tone={linked ? "emerald" : "amber"}>
                          {linked
                            ? t(M.users.linkedPlayerChip, { name: linked.fullName })
                            : t(M.users.notLinkedChip)}
                        </Badge>
                      ) : null}
                      {user.status !== "active" ? (
                        <Badge tone={statusTone(user.status)}>
                          {USER_STATUS_LABELS[user.status]}
                        </Badge>
                      ) : null}
                      {user.id === currentUser?.id ? (
                        <Badge tone="slate">{t(M.users.youBadge)}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-muted" dir="ltr">
                      {[user.email, user.phone].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {team ? (
                      <p className="mt-0.5 text-[10px] text-muted">
                        {t(M.dashboard.teamOf, { name: team.name })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {user.status === "rejected" ? (
                      <button
                        type="button"
                        onClick={() => decide(user, true)}
                        disabled={busyId === user.id}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100"
                        aria-label={t(M.users.reapproveAria)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    {user.role === "player" ? (
                      <button
                        type="button"
                        onClick={() => openLink(user)}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-muted transition hover:bg-slate-100 hover:text-ink"
                        aria-label={t(M.users.linkPlayerAria, { name: user.name })}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    {user.id !== currentUser?.id ? (
                      <button
                        type="button"
                        onClick={() => resetPassword(user)}
                        disabled={busyId === user.id}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-muted transition hover:bg-slate-100 hover:text-ink"
                        aria-label={t(M.users.resetPasswordAria, { name: user.name })}
                      >
                        {busyId === user.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {!members.length ? (
              <EmptyState
                icon={<UserCog className="h-5 w-5" />}
                title={t(M.users.noUsersTitle)}
                description={t(M.users.noUsersDesc)}
                className="m-4 border-0 bg-transparent"
              />
            ) : null}
          </div>
        </Card>

        <div className="space-y-4 lg:space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <UserCog className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[14px] font-bold text-ink">{t(M.users.accessMethod)}</h2>
                <p className="text-[10px] text-muted">
                  {authMode === "cloud" ? t(M.users.cloudAuth) : t(M.users.demoAuth)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-6 text-muted">
              {authMode === "cloud" ? t(M.users.cloudNote) : t(M.users.demoNote)}
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Link2 className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-[14px] font-bold text-ink">{t(M.users.playerScopeTitle)}</h2>
                  <p className="text-[10px] text-muted">{t(M.users.playerScopeSub)}</p>
                </div>
              </div>
              {unlinkedPlayers ? (
                <Badge tone="amber">{faNum(unlinkedPlayers)}</Badge>
              ) : null}
            </div>
            <p className="mt-3 text-[11px] leading-6 text-muted">
              {t(M.users.playerScopeNote)}
            </p>
          </Card>
        </div>
      </div>

      <MemberForm open={memberOpen} onClose={() => setMemberOpen(false)} />

      <Sheet
        open={Boolean(linkTarget)}
        onClose={() => setLinkTarget(null)}
        title={t(M.users.linkPlayerTitle)}
        description={linkTarget ? t(M.users.linkPlayerDesc, { name: linkTarget.name }) : ""}
        footer={
          <div className="flex gap-2">
            <Button type="button" className="flex-1" onClick={submitLink} disabled={linkBusy}>
              {linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {t(M.users.linkPlayerSubmit)}
            </Button>
            <Button type="button" variant="outline" className="w-28" onClick={() => setLinkTarget(null)}>
              {t(M.form.cancel)}
            </Button>
          </div>
        }
      >
        <Field label={t(M.memberForm.playerField)} hint={t(M.memberForm.playerHint)}>
          <Select value={linkPlayerId} onChange={(event) => setLinkPlayerId(event.target.value)}>
            <option value="">{t(M.memberForm.noPlayer)}</option>
            {data.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.fullName}
              </option>
            ))}
          </Select>
        </Field>
      </Sheet>

      <ConfirmDialog
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => {
          if (rejectTarget) void decide(rejectTarget, false);
        }}
        title={t(M.users.rejectTitle)}
        description={
          rejectTarget
            ? t(M.users.rejectDesc, { name: rejectTarget.name })
            : ""
        }
        confirmLabel={t(M.users.rejectRequest)}
        danger
      />

      <Sheet
        open={Boolean(credential)}
        onClose={() => setCredential(null)}
        title={t(M.users.credentialTitle)}
        description={t(M.users.credentialDesc)}
        footer={
          <Button type="button" className="w-full" onClick={() => setCredential(null)}>
            {t(M.ui.close)}
          </Button>
        }
      >
        {credential ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] leading-5 text-emerald-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              {credential.message}
            </div>
            <div className="rounded-2xl border border-line/80 bg-slate-50/80 p-4">
              <p className="text-[11px] text-muted">{t(M.users.userWord)}</p>
              <p className="mt-1 text-[14px] font-bold text-ink">{credential.name}</p>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-line/70">
                <Mail className="h-3.5 w-3.5 text-muted" />
                <span className="flex-1 font-mono text-[11px]" dir="ltr">
                  {credential.email}
                </span>
                <button
                  type="button"
                  onClick={() => copy(credential.email, t(M.users.emailWord))}
                  className="text-muted hover:text-ink"
                  aria-label={t(M.users.copyEmailAria)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              {credential.tempPassword ? (
                <div className="mt-2 rounded-xl bg-white px-3 py-3 text-center ring-1 ring-line/70">
                  <p className="text-[10px] text-muted">{t(M.users.tempPasswordWord)}</p>
                  <p className="mt-1 font-mono text-lg font-bold tracking-wider text-ink" dir="ltr">
                    {credential.tempPassword}
                  </p>
                  <button
                    type="button"
                    onClick={() => copy(credential.tempPassword ?? "", t(M.users.tempPasswordWord))}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-brand-600"
                  >
                    <Copy className="h-3 w-3" />
                    {t(M.users.copyPasswordBtn)}
                  </button>
                </div>
              ) : null}
            </div>
            <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-5 text-muted">
              {t(M.users.credentialHint)}
            </p>
          </div>
        ) : null}
      </Sheet>

    </div>
  );
}
