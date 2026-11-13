"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  CloudOff,
  Copy,
  Database,
  Download,
  Eraser,
  KeyRound,
  Loader2,
  LogOut,
  Pencil,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Upload,
  UserCog,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { useClub } from "@/lib/store";
import { DEMO_DATA_VERSION } from "@/lib/seed";
import { ROLE_LABELS, SPORT_LABELS, USER_STATUS_LABELS } from "@/lib/labels";
import { isApiConfigured } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";
import { faNum } from "@/lib/format";
import { faDate } from "@/lib/date";
import type { SyncStatus } from "@/lib/record-sync";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ClubLogo,
  Input,
  PageHeader,
  cn,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ClubProfileSheet } from "@/components/club-profile-sheet";
import { PasswordSheet } from "@/components/password-sheet";
import { RestoreSheet } from "@/components/restore-sheet";
import { EmzaSettingsCard } from "@/components/emza-settings";
import { LocaleSwitch } from "@/components/locale-switch";
import { M, type Message, useT } from "@/lib/i18n/messages";

const SYNC_STATUS_MESSAGES: Record<SyncStatus, Message> = {
  off: M.settings.statusOff,
  connecting: M.settings.statusConnecting,
  syncing: M.settings.statusSyncing,
  synced: M.settings.statusSynced,
  offline: M.settings.statusOffline,
  error: M.settings.statusError,
};

export default function SettingsPage() {
  const {
    data,
    currentUser,
    role,
    isManager,
    isPlayer,
    authMode,
    pendingUsers,
    logout,
    resetDemo,
    clearClubRecords,
    sync,
    syncNow,
    joinSharedClub,
    rotateInviteCode,
    toast,
  } = useClub();
  const t = useT();
  const router = useRouter();
  const [resetOpen, setResetOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [syncBusy, setSyncBusy] = useState<"join" | "rotate" | "sync" | null>(null);

  if (!currentUser) return null;

  const team = currentUser.teamId
    ? data.teams.find((row) => row.id === currentUser.teamId)
    : undefined;

  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const fileName = data.club.shortName.trim().replace(/\s+/g, "-") || "club";
    link.download = `${fileName}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast(t(M.settings.backupDownloaded), "info");
  };

  const signOut = () => {
    logout();
    router.replace("/login");
  };

  const runJoinShare = async () => {
    setSyncBusy("join");
    const result = await joinSharedClub(joinCode);
    setSyncBusy(null);
    if (result.ok) setJoinCode("");
    toast(result.message ?? t(M.settings.joinFailed), result.ok ? "success" : "error");
  };

  const runRotateCode = async () => {
    setSyncBusy("rotate");
    const result = await rotateInviteCode();
    setSyncBusy(null);
    toast(result.message ?? t(M.settings.rotateFailed), result.ok ? "success" : "error");
  };

  const runSyncNow = async () => {
    setSyncBusy("sync");
    await syncNow();
    setSyncBusy(null);
  };

  const copyInviteCode = async () => {
    if (!sync.inviteCode) return;
    try {
      await navigator.clipboard.writeText(sync.inviteCode);
      toast(t(M.settings.codeCopied), "info");
    } catch {
      toast(t(M.settings.codeCopyFailed), "error");
    }
  };

  const syncTone: "emerald" | "rose" | "amber" | "brand" | "slate" =
    sync.status === "synced"
      ? "emerald"
      : sync.status === "error"
        ? "rose"
        : sync.status === "offline"
          ? "amber"
          : sync.status === "connecting" || sync.status === "syncing"
            ? "brand"
            : "slate";

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title={t(M.shell.titleSettings)}
        subtitle={t(M.settings.subtitle)}
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Avatar name={currentUser.name} src={currentUser.photo} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[16px] font-extrabold text-ink">{currentUser.name}</h2>
              <p className="mt-0.5 text-[11px] text-muted" dir="ltr">
                {currentUser.email}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="brand">
                  <ShieldCheck className="h-3 w-3" />
                  {role ? ROLE_LABELS[role] : ""}
                </Badge>
                <Badge tone="emerald">
                  {currentUser.status
                    ? USER_STATUS_LABELS[currentUser.status]
                    : t(M.settings.activeWord)}
                </Badge>
                {team ? (
                  <Badge tone="slate">{t(M.dashboard.teamOf, { name: team.name })}</Badge>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-2">
            {isPlayer && currentUser.playerId ? (
              <Link
                href={`/players?id=${currentUser.playerId}`}
                className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] font-medium text-ink transition hover:bg-slate-100"
              >
                <UserRound className="h-4 w-4 text-muted" />
                {t(M.settings.viewMyProfile)}
                <ChevronLeft className="ms-auto h-4 w-4 text-muted/60 ltr:rotate-180" />
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setPasswordOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] font-medium text-ink transition hover:bg-slate-100"
            >
              <KeyRound className="h-4 w-4 text-muted" />
              {t(M.settings.changePassword)}
              <ChevronLeft className="ms-auto h-4 w-4 text-muted/60 ltr:rotate-180" />
            </button>
            <button
              type="button"
              onClick={signOut}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-medium text-rose-600 transition hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              {t(M.shell.signOut)}
            </button>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
              <span className="text-[12px] font-medium text-ink">
                {t(M.ui.language)}
                <span className="mt-0.5 block text-[10px] font-normal leading-4 text-muted">
                  {t(M.ui.languageHint)}
                </span>
              </span>
              <LocaleSwitch />
            </div>
          </div>
        </Card>

        {isManager ? (
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <UserCog className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-[14px] font-bold text-ink">{t(M.shell.titleUsers)}</h2>
                  <p className="text-[10px] text-muted">{t(M.settings.coachRequestsSub)}</p>
                </div>
              </div>
              {pendingUsers.length ? (
                <Badge tone="amber">
                  {t(M.users.pendingCount, { count: faNum(pendingUsers.length) })}
                </Badge>
              ) : null}
            </div>
            <p className="mt-3 text-[11px] leading-6 text-muted">
              {t(M.settings.coachRequestsBody)}
            </p>
            <Link
              href="/users"
              className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-brand-600"
            >
              {t(M.settings.manageUsers)}
              <ChevronLeft className="h-3.5 w-3.5 ltr:rotate-180" />
            </Link>
          </Card>
        ) : null}

        <Card className="p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <ClubLogo logo={data.club.logo} className="h-10 w-10 rounded-xl" />
              <div className="min-w-0">
                <h2 className="truncate text-[14px] font-bold text-ink">{data.club.name}</h2>
                <p className="text-[10px] text-muted">
                  {t(M.settings.clubProfileChip, { sport: SPORT_LABELS[data.club.sport] })}
                </p>
              </div>
            </div>
            {isManager ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setProfileOpen(true)}
                className="shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" />
                {t(M.form.edit)}
              </Button>
            ) : null}
          </div>

          <dl className="mt-4 space-y-2.5 text-[12px]">
            {[
              { label: t(M.clubProfile.sportLabel), value: SPORT_LABELS[data.club.sport], ltr: false },
              { label: t(M.clubProfile.cityLabel), value: data.club.city || "—", ltr: false },
              { label: t(M.clubProfile.foundedLabel), value: data.club.founded || "—", ltr: false },
              { label: t(M.clubProfile.phoneLabel), value: data.club.phone || "—", ltr: true },
              {
                label: t(M.settings.teamsCountLabel),
                value: t(M.settings.teamsValue, { count: faNum(data.teams.length) }),
                ltr: false,
              },
              {
                label: t(M.settings.playersCountLabel),
                value: t(M.settings.playersValue, { count: faNum(data.players.length) }),
                ltr: false,
              },
            ].map(({ label, value, ltr }) => (
              <div key={label} className="flex items-center justify-between border-b border-line/60 pb-2 last:border-0 last:pb-0">
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium text-ink" dir={ltr ? "ltr" : undefined}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {t(M.settings.activeSeason, { season: data.club.season })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600">
                <Database className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[14px] font-bold text-ink">{t(M.settings.dataTitle)}</h2>
                <p className="text-[10px] text-muted">
                  {t(authMode === "cloud" ? M.settings.dataCloudSub : M.settings.dataSub)}
                </p>
              </div>
            </div>
            <Badge tone={authMode === "cloud" ? "emerald" : "amber"}>
              {t(authMode === "cloud" ? M.settings.cloudBadge : M.settings.demoBadge)}
            </Badge>
          </div>

          <p className="mt-3 text-[11px] leading-6 text-muted">
            {t(authMode === "cloud" ? M.settings.dataCloudBody : M.settings.dataBody, {
              players: faNum(data.players.length),
              events: faNum(data.events.length),
              invoices: faNum(data.invoices.length),
            })}
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" size="sm" onClick={downloadBackup}>
              <Download className="h-3.5 w-3.5" />
              {t(M.settings.downloadBackup)}
            </Button>
            {authMode === "demo" ? (
              <>
                {isManager ? (
                  <Button variant="outline" size="sm" onClick={() => setRestoreOpen(true)}>
                    <Upload className="h-3.5 w-3.5" />
                    {t(M.settings.restoreBackup)}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClearOpen(true)}
                  className="text-rose-600 ring-rose-200 hover:bg-rose-50"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  {t(M.settings.clearRecords)}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetOpen(true)}
                  className="text-amber-700 ring-amber-200 hover:bg-amber-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t(M.settings.restoreDemo)}
                </Button>
              </>
            ) : null}
          </div>

          {authMode === "demo" ? (
            <p className="mt-3 text-[10px] text-muted">
              {t(M.settings.dataVersion, { version: faNum(DEMO_DATA_VERSION) })}
            </p>
          ) : (
            <p className="mt-3 text-[10px] leading-5 text-muted">
              {t(M.settings.cloudResetNote)}
            </p>
          )}
        </Card>

        {!isPlayer ? (
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-xl",
                    sync.clubId ? "bg-sky-50 text-sky-600" : "bg-slate-100 text-slate-500",
                  )}
                >
                  <Users className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-[14px] font-bold text-ink">{t(M.settings.syncTitle)}</h2>
                  <p className="text-[10px] text-muted">{t(M.settings.syncSub)}</p>
                </div>
              </div>
              <Badge tone={syncTone} dot>
                {t(SYNC_STATUS_MESSAGES[sync.status])}
              </Badge>
            </div>

            {authMode !== "cloud" ? (
              <div className="mt-3 space-y-2">
                <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-6 text-muted">
                  {t(M.settings.syncEnableBody)}
                </p>
                <div className="rounded-xl bg-slate-900 px-3 py-2.5 font-mono text-[10px] leading-5 text-slate-300" dir="ltr">
                  <p>NEXT_PUBLIC_API_BASE=...</p>
                </div>
              </div>
            ) : !sync.clubId ? (
              <div className="mt-4 space-y-3">
                <p className="text-[11px] leading-6 text-muted">
                  {t(M.settings.syncHow)}
                </p>

                <div className="rounded-xl border border-line p-3">
                  <p className="text-[11px] font-semibold text-ink">{t(M.settings.joinShared)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Input
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      placeholder={t(M.settings.phJoinCode)}
                      dir="ltr"
                      className="min-w-0 flex-1 font-mono tracking-widest"
                      autoComplete="off"
                    />
                    <Button
                      variant="outline"
                      onClick={runJoinShare}
                      disabled={syncBusy !== null || !joinCode.trim()}
                    >
                      {syncBusy === "join" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      {t(M.settings.joinBtn)}
                    </Button>
                  </div>
                  <p className="mt-2 text-[10px] leading-5 text-muted">
                    {t(M.settings.joinNote)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] text-muted">{t(M.settings.sharedClub)}</p>
                      <p className="text-[13px] font-bold text-ink">
                        {sync.clubName ?? data.club.name}
                      </p>
                    </div>
                    {sync.pendingCount ? (
                      <Badge tone="amber">
                        {t(M.settings.pendingSendBadge, { count: faNum(sync.pendingCount) })}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-lg bg-white px-2.5 py-1 font-mono text-[15px] tracking-[0.2em] text-ink ring-1 ring-line"
                      dir="ltr"
                    >
                      {sync.inviteCode ?? "—"}
                    </span>
                    <Button size="sm" variant="ghost" onClick={copyInviteCode}>
                      <Copy className="h-3.5 w-3.5" />
                      {t(M.settings.copyCodeBtn)}
                    </Button>
                    {isManager ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={runRotateCode}
                        disabled={syncBusy !== null}
                      >
                        {syncBusy === "rotate" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        {t(M.settings.rotateCode)}
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[10px] leading-5 text-muted">
                    {t(M.settings.giveCodeNote)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runSyncNow}
                    disabled={syncBusy !== null || sync.status === "connecting"}
                  >
                    {syncBusy === "sync" || sync.status === "syncing" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {t(M.settings.syncNow)}
                  </Button>
                  <span className="text-[10px] text-muted">
                    {t(M.settings.lastSync)}{" "}
                    {sync.lastSyncAt
                      ? faDate(sync.lastSyncAt, {
                          day: "numeric",
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                </div>

                {sync.error ? (
                  <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[10px] leading-5 text-rose-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {sync.error}
                  </p>
                ) : null}
              </div>
            )}
          </Card>
        ) : null}

        <EmzaSettingsCard />

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-xl",
                  isApiConfigured
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-slate-100 text-slate-500",
                )}
              >
                {isApiConfigured ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <CloudOff className="h-4 w-4" />
                )}
              </span>
              <div>
                <h2 className="text-[14px] font-bold text-ink">{t(M.settings.authTitle)}</h2>
                <p className="text-[10px] text-muted">{t(M.settings.authSub)}</p>
              </div>
            </div>
            <Badge tone={isApiConfigured ? "emerald" : "slate"} dot>
              {isApiConfigured ? t(M.settings.activeWord) : t(M.users.demoAuth)}
            </Badge>
          </div>

          {isApiConfigured ? (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] leading-6 text-muted">
                {t(M.settings.apiConfiguredBody)}
              </p>
              <p
                className={cn(
                  "flex items-start gap-2 rounded-xl px-3 py-2 text-[10px] leading-5",
                  isSupabaseConfigured ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-muted",
                )}
              >
                <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t(isSupabaseConfigured ? M.settings.realtimeOn : M.settings.realtimeOff)}
              </p>
            </div>
          ) : (
            <>
              <p className="mt-3 text-[11px] leading-6 text-muted">
                {t(M.settings.setupApiBody)}
              </p>
              <div className="mt-2 space-y-1 rounded-xl bg-slate-900 px-3 py-2.5 font-mono text-[10px] leading-5 text-slate-300" dir="ltr">
                <p>NEXT_PUBLIC_API_BASE=https://your-api.example.com</p>
              </div>
              <p className="mt-2 text-[10px] leading-5 text-muted">
                {t(M.settings.localModeBody)}
              </p>
            </>
          )}
        </Card>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-500/15 text-accent-600">
          <Smartphone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-ink">{t(M.settings.installTitle)}</p>
          <p className="mt-0.5 text-[10px] leading-5 text-muted">
            {t(M.settings.installBody)}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-muted">
          {t(M.settings.appVersion, { version: "0.1.0" })}
        </span>
      </Card>

      <ClubProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      <PasswordSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} />

      {authMode === "demo" ? (
        <>
          <RestoreSheet open={restoreOpen} onClose={() => setRestoreOpen(false)} />

          <ConfirmDialog
            open={clearOpen}
            onClose={() => setClearOpen(false)}
            onConfirm={clearClubRecords}
            title={t(M.settings.clearTitle)}
            description={t(M.settings.clearDesc)}
            confirmLabel={t(M.settings.clearConfirm)}
            danger
          />

          <ConfirmDialog
            open={resetOpen}
            onClose={() => setResetOpen(false)}
            onConfirm={resetDemo}
            title={t(M.settings.resetTitle)}
            description={t(M.settings.resetDesc)}
            confirmLabel={t(M.settings.resetConfirm)}
            danger
          />
        </>
      ) : null}
    </div>
  );
}
