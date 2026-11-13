"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Camera,
  ChartNoAxesCombined,
  CheckCircle2,
  ClipboardList,
  Fingerprint,
  KeyRound,
  Loader2,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { useClub, type SignupInput } from "@/lib/store";
import { DEMO_ACCOUNT_IDS } from "@/lib/seed";
import { ROLE_LABELS, SPORT_LABELS, SPORT_ORDER } from "@/lib/labels";
import { DEMO_PASSWORD } from "@/lib/local-auth";
import { resendConfirmationEmail } from "@/lib/cloud-auth";
import {
  authenticateBiometric,
  biometricErrorText,
  enrollBiometric,
  isBiometricSupported,
} from "@/lib/biometric";
import { fileToSquareDataUrl } from "@/lib/image";
import { useDocumentTitle } from "@/lib/use-document-title";
import { M, useT } from "@/lib/i18n/messages";
import {
  Avatar,
  Badge,
  Button,
  ClubLogo,
  Field,
  Input,
  Segmented,
  Select,
  Splash,
  Textarea,
  cn,
} from "@/components/ui";
import { LocaleSwitch } from "@/components/locale-switch";
import type { Sport } from "@/lib/types";

const roleIcons = {
  manager: ShieldCheck,
  coach: ClipboardList,
  player: UserRound,
} as const;

type AuthView = "signin" | "signup" | "forgot";
type Notice = { tone: "success" | "error" | "info"; text: string } | null;

export default function LoginPage() {
  const {
    ready,
    data,
    authMode,
    login,
    loginDemo,
    signup,
    update,
    requestPasswordReset,
    setSport,
    bootstrapClub,
  } = useClub();
  const router = useRouter();
  const t = useT();

  const [view, setView] = useState<AuthView>("signin");
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmationNeeded, setConfirmationNeeded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [biometricReady, setBiometricReady] = useState(false);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<"player" | "coach">("player");
  const [teamId, setTeamId] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [clubName, setClubName] = useState("");

  useDocumentTitle(ready ? t(M.login.docTitle, { club: data.club.name }) : null);

  useEffect(() => {
    setBiometricReady(isBiometricSupported());
  }, []);

  // The setup panel also opens on a device that already holds accounts — a restore, or a
  // club left without a manager — so its name starts where the club already is.
  useEffect(() => {
    if (!ready || data.users.length === 0) return;
    const manager = data.users.find((user) => user.role === "manager");
    if (!manager || manager.status !== "active") {
      setClubName((current) => current || data.club.name);
    }
  }, [ready, data.users, data.club.name]);

  if (!ready) return <Splash />;

  const demoUsers = data.users.filter((user) => user.status === "active");

  // Sample accounts may be entered with one tap; accounts a real manager created always need their password.
  const isSampleClub = data.users.some((user) => DEMO_ACCOUNT_IDS.includes(user.id));
  const deviceManager = data.users.find((user) => user.role === "manager");
  const deviceManagerEmail = deviceManager?.email ?? "";

  // The setup screen is about the missing manager account, not about whether anyone
  // has ever used this device — a club whose records were cleared, or a backup
  // restored without a manager, has to be able to create one again.
  const needsSetup = !deviceManager || deviceManager.status !== "active";

  const submitSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    if (password !== confirm) {
      setNotice({ tone: "error", text: t(M.login.passwordMismatch) });
      return;
    }
    setBusy("setup");
    const result = await bootstrapClub({
      clubName,
      fullName: name,
      email,
      phone: phone.trim() || undefined,
      password,
      sport: data.club.sport,
    });
    setBusy(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.message ?? t(M.login.clubCreateFailed) });
      return;
    }
    router.replace("/");
  };

  const savePhoto = async (file: File, userId: string) => {
    const target = data.users.find((user) => user.id === userId);
    if (!target) return;
    try {
      const photo = await fileToSquareDataUrl(file);
      const hadPhoto = Boolean(target.photo);
      update((current) => ({
        ...current,
        users: current.users.map((user) => (user.id === userId ? { ...user, photo } : user)),
      }));
      setNotice({
        tone: "success",
        text: hadPhoto
          ? t(M.login.photoUpdated, { name: target.name })
          : t(M.login.photoSaved, { name: target.name }),
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : t(M.login.photoFailed),
      });
    }
  };

  const onPhotoPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const userId = photoTargetId;
    event.target.value = "";
    setPhotoTargetId(null);
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) {
      setNotice({ tone: "error", text: t(M.login.notAnImage) });
      return;
    }
    await savePhoto(file, userId);
  };

  const enrollFingerprint = async (userId: string) => {
    const target = data.users.find((user) => user.id === userId);
    if (!target) return;
    setBusy(`enroll-${userId}`);
    setNotice(null);
    try {
      await enrollBiometric({ id: target.id, name: target.name, email: target.email });
      update((current) => ({
        ...current,
        users: current.users.map((user) =>
          user.id === userId ? { ...user, biometric: true } : user,
        ),
      }));
      setNotice({
        tone: "success",
        text: t(M.login.fingerprintEnrolled, { name: target.name }),
      });
    } catch (error) {
      setNotice({ tone: "error", text: biometricErrorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const loginWithFingerprint = async () => {
    setBusy("biometric");
    setNotice(null);
    try {
      const userId = await authenticateBiometric();
      if (!userId) {
        setNotice({
          tone: "error",
          text: t(M.login.fingerprintUnknown),
        });
        return;
      }
      const user = data.users.find((row) => row.id === userId && row.status === "active");
      if (!user) {
        setNotice({ tone: "error", text: t(M.login.fingerprintInactive) });
        return;
      }
      loginDemo(user.id);
      router.replace("/");
    } catch (error) {
      setNotice({ tone: "error", text: biometricErrorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const switchView = (next: AuthView) => {
    setView(next);
    setNotice(null);
    setPassword("");
    setConfirm("");
  };

  const submitSignin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("signin");
    setNotice(null);
    setConfirmationNeeded(false);
    const result = await login(email, password);
    setBusy(null);
    if (result.ok) {
      router.replace("/");
      return;
    }
    setConfirmationNeeded(result.code === "email_unconfirmed");
    setNotice({ tone: "error", text: result.message ?? t(M.login.signinFailed) });
  };

  const resendConfirmation = async () => {
    if (!email.trim()) return;
    setBusy("resend-confirmation");
    try {
      await resendConfirmationEmail(email.trim());
      setNotice({ tone: "success", text: t(M.login.signupPending) });
      setConfirmationNeeded(false);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : t(M.login.signupFailed),
      });
    } finally {
      setBusy(null);
    }
  };

  const submitSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    if (password !== confirm) {
      setNotice({ tone: "error", text: t(M.login.passwordMismatch) });
      return;
    }
    if (role === "player" && !teamId) {
      setNotice({ tone: "info", text: t(M.login.teamLaterNote) });
    }
    const input: SignupInput = {
      name,
      email,
      phone: phone.trim() || undefined,
      password,
      role,
      teamId: role === "player" && teamId ? teamId : undefined,
      requestNote: role === "coach" ? requestNote : undefined,
      inviteCode: inviteCode.trim() || undefined,
    };
    setBusy("signup");
    const result = await signup(input);
    setBusy(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.message ?? t(M.login.signupFailed) });
      return;
    }
    if (result.loggedIn) {
      router.replace("/");
      return;
    }
    setNotice({
      tone: "success",
      text: result.message ?? t(M.login.signupPending),
    });
    setView("signin");
    setPassword("");
    setConfirm("");
  };

  const submitForgot = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("forgot");
    setNotice(null);
    const result = await requestPasswordReset(forgotEmail || email);
    setBusy(null);
    setNotice({
      tone: result.ok ? "success" : "error",
      text: result.message ?? t(M.login.resetFailed),
    });
  };

  const quickLogin = (userId: string) => {
    if (!isSampleClub) {
      const user = data.users.find((row) => row.id === userId);
      if (!user) return;
      setView("signin");
      setEmail(user.email);
      setPassword("");
      setNotice({
        tone: "info",
        text: t(M.login.emailPrefilled, { name: user.name }),
      });
      return;
    }
    loginDemo(userId);
    router.replace("/");
  };

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-night-900 text-white">
      <div className="pointer-events-none absolute inset-0 court-grid opacity-[0.18]" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-600/40 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-accent-500/20 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-10 pt-safe sm:px-8 lg:flex-row lg:items-center lg:gap-14 lg:py-14">
        <div className="flex flex-1 flex-col pt-8 lg:pt-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ClubLogo
                logo={data.club.logo}
                className="h-12 w-12 rounded-2xl bg-white/10 backdrop-blur"
              />
              <div>
                <p className="text-[15px] font-extrabold">{data.club.name}</p>
                <p className="text-[11px] text-white/55">
                  {t(M.login.systemTagline, { sport: SPORT_LABELS[data.club.sport] })}
                </p>
              </div>
            </div>
            <LocaleSwitch compact />
          </div>

          <h1 className="mt-8 max-w-md text-[29px] font-black leading-[1.35] tracking-tight sm:text-4xl">
            {t(M.login.heroTitle)}
            <br />
            <span className="text-accent-400">{t(M.login.heroAccent)}</span>
          </h1>
          <p className="mt-4 max-w-sm text-[13px] leading-6 text-white/60">
            {t(M.login.heroLead)}
          </p>

          <div className="mt-7 grid max-w-md grid-cols-2 gap-2.5">
            {[
              { icon: CalendarCheck, label: M.login.featureSchedule },
              { icon: ChartNoAxesCombined, label: M.login.featureStats },
              { icon: Wallet, label: M.login.featureFinance },
              { icon: ShieldCheck, label: M.login.featureCoachAccess },
            ].map((feature) => (
              <div
                key={t(feature.label)}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-[11px] text-white/75"
              >
                <feature.icon className="h-4 w-4 text-accent-400" />
                {t(feature.label)}
              </div>
            ))}
          </div>

          {needsSetup ? (
            <div className="mt-6 max-w-md rounded-2xl border border-brand-400/25 bg-brand-400/10 p-4">
              <p className="text-[12px] font-bold text-brand-100">{t(M.login.setupPanelTitle)}</p>
              <p className="mt-1.5 text-[11px] leading-6 text-white/65">
                {t(M.login.setupPanelBody)}
              </p>
            </div>
          ) : authMode === "demo" ? (
            <div className="mt-6 max-w-md rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-bold text-amber-100">
                  {t(isSampleClub ? M.login.sampleAccounts : M.login.deviceAccounts)}
                </p>
                {isSampleClub ? (
                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-200">
                    {t(M.login.defaultPassword)} <span dir="ltr">{DEMO_PASSWORD}</span>
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-200">
                    {t(M.login.passwordOnly)}
                  </span>
                )}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {demoUsers.map((user) => {
                  const Icon = roleIcons[user.role];
                  const enrolling = busy === `enroll-${user.id}`;
                  return (
                    <div
                      key={user.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-2 transition hover:border-white/25 hover:bg-white/10"
                    >
                      <button
                        type="button"
                        onClick={() => quickLogin(user.id)}
                        className="flex w-full items-center gap-2 text-start"
                      >
                        <span className="relative">
                          <Avatar name={user.name} src={user.photo} size="xs" ring={false} />
                          {user.biometric ? (
                            <span className="absolute -bottom-1 -end-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-500 text-white">
                              <Fingerprint className="h-2.5 w-2.5" />
                            </span>
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-semibold">
                            {user.name}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1 text-[9px] text-white/50">
                            <Icon className="h-2.5 w-2.5" />
                            {ROLE_LABELS[user.role]}
                          </span>
                        </span>
                        <ArrowLeft className="h-3.5 w-3.5 text-accent-400 ltr:rotate-180" />
                      </button>
                      <div className="mt-1.5 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoTargetId(user.id);
                            photoInputRef.current?.click();
                          }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/5 px-1 py-1 text-[9px] text-white/70 transition hover:bg-white/15"
                        >
                          <Camera className="h-2.5 w-2.5" />
                          {t(user.photo ? M.login.changePhoto : M.login.profilePhoto)}
                        </button>
                        <button
                          type="button"
                          disabled={!biometricReady || enrolling}
                          onClick={() => enrollFingerprint(user.id)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/5 px-1 py-1 text-[9px] text-white/70 transition hover:bg-white/15 disabled:opacity-40"
                        >
                          {enrolling ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <Fingerprint className="h-2.5 w-2.5" />
                          )}
                          {t(user.biometric ? M.login.reenroll : M.login.fingerprint)}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] leading-5 text-amber-100/70">
                {t(isSampleClub ? M.login.sampleAccountsHint : M.login.deviceAccountsHint)} {" "}
                {t(M.login.accountsHelp)}
              </p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={onPhotoPicked}
              />
              <button
                type="button"
                onClick={() => {
                  setView("signin");
                  setEmail(isSampleClub ? "manager@setaregan.ir" : deviceManagerEmail);
                  setPassword(isSampleClub ? DEMO_PASSWORD : "");
                  setNotice(null);
                }}
                className="mt-3 text-[10px] text-amber-200/80 underline-offset-4 hover:underline"
              >
                {t(M.login.fillManagerForm)}
              </button>
            </div>
          ) : (
            <div className="mt-6 flex max-w-md items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2.5 text-[11px] text-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
              {t(M.login.cloudActive)}
            </div>
          )}
        </div>

        <div className="mt-8 w-full lg:mt-0 lg:max-w-md">
          <div className="rounded-[28px] bg-white p-5 text-ink shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold">
                  {t(
                    needsSetup
                      ? M.login.titleSetup
                      : view === "signin"
                        ? M.login.titleSignin
                        : view === "signup"
                          ? M.login.titleSignup
                          : M.login.titleForgot,
                  )}
                </h2>
                <p className="mt-1 text-[12px] text-muted">
                  {t(
                    needsSetup
                      ? M.login.subtitleSetup
                      : view === "signin"
                        ? M.login.subtitleSignin
                        : view === "signup"
                          ? M.login.subtitleSignup
                          : M.login.subtitleForgot,
                  )}
                </p>
              </div>
              <Badge tone={authMode === "cloud" ? "emerald" : "amber"} dot>
                {authMode === "cloud" ? t(M.login.badgeCloud) : t(M.login.badgeDemo)}
              </Badge>
            </div>

            {needsSetup ? (
              <form onSubmit={submitSetup} className="mt-4 space-y-3.5">
                <Field label={t(M.login.clubName)}>
                  <Input
                    required
                    value={clubName}
                    onChange={(event) => setClubName(event.target.value)}
                    placeholder={t(M.login.phClubName)}
                  />
                </Field>
                <Field label={t(M.login.managerName)}>
                  <Input
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t(M.login.phManagerName)}
                  />
                </Field>
                <Field label={t(M.login.managerEmail)}>
                  <Input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="manager@club.ir"
                    dir="ltr"
                    className="text-right ltr:text-left"
                  />
                </Field>
                <Field label={t(M.login.phoneOptional)} hint={t(M.login.phoneHint)}>
                  <Input
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="09123456789"
                    dir="ltr"
                    className="text-right ltr:text-left"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label={t(M.login.password)}>
                    <Input
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t(M.login.phMinChars)}
                      dir="ltr"
                      className="text-right ltr:text-left"
                    />
                  </Field>
                  <Field label={t(M.login.confirmPassword)}>
                    <Input
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(event) => setConfirm(event.target.value)}
                      placeholder="••••••••"
                      dir="ltr"
                      className="text-right ltr:text-left"
                    />
                  </Field>
                </div>
                <div className="space-y-2 rounded-xl border border-line/80 bg-slate-50/70 p-3">
                  <span className="text-[10px] font-semibold text-ink">{t(M.login.clubSport)}</span>
                  <Segmented<Sport>
                    className="bg-white"
                    size="sm"
                    value={data.club.sport}
                    onChange={setSport}
                    options={SPORT_ORDER.map((sport) => ({
                      value: sport,
                      label: SPORT_LABELS[sport],
                    }))}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy !== null}>
                  {busy === "setup" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  {busy === "setup" ? t(M.login.creating) : t(M.login.createAndEnter)}
                </Button>
                <p className="text-[10px] leading-5 text-muted">
                  {t(authMode === "cloud" ? M.login.serverStorageNote : M.login.deviceStorageNote)}
                </p>
              </form>
            ) : null}

            {view !== "forgot" && !needsSetup ? (
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100/90 p-1">
                <button
                  type="button"
                  onClick={() => switchView("signin")}
                  className={cn(
                    "h-9 rounded-xl text-[13px] font-medium transition",
                    view === "signin"
                      ? "bg-white text-ink shadow-sm ring-1 ring-line/60"
                      : "text-muted hover:text-ink",
                  )}
                >
                  {t(M.login.tabSignin)}
                </button>
                <button
                  type="button"
                  onClick={() => switchView("signup")}
                  className={cn(
                    "h-9 rounded-xl text-[13px] font-medium transition",
                    view === "signup"
                      ? "bg-white text-ink shadow-sm ring-1 ring-line/60"
                      : "text-muted hover:text-ink",
                  )}
                >
                  {t(M.login.tabSignup)}
                </button>
              </div>
            ) : null}

            {notice ? (
              <div
                className={cn(
                  "mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11px] leading-5",
                  notice.tone === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : notice.tone === "info"
                      ? "bg-brand-50 text-brand-700"
                      : "bg-rose-50 text-rose-700",
                )}
              >
                {notice.tone === "error" ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <span>{notice.text}</span>
                  {confirmationNeeded ? (
                    <button
                      type="button"
                      onClick={resendConfirmation}
                      disabled={busy !== null}
                      className="mt-1 block font-bold underline underline-offset-2 disabled:opacity-50"
                    >
                      {busy === "resend-confirmation"
                        ? t(M.login.sending)
                        : t(M.login.resendConfirmation)}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {view === "signin" && !needsSetup ? (
              <form onSubmit={submitSignin} className="mt-4 space-y-3.5">
                <Field label={t(M.login.email)}>
                  <Input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@club.ir"
                    dir="ltr"
                    className="text-right ltr:text-left"
                  />
                </Field>
                <Field label={t(M.login.password)}>
                  <Input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    dir="ltr"
                    className="text-right ltr:text-left"
                  />
                </Field>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      switchView("forgot");
                    }}
                    className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                  >
                    {t(M.login.forgotPassword)}
                  </button>
                </div>
                <Button type="submit" className="w-full" disabled={busy !== null}>
                  {busy === "signin" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  {busy === "signin" ? t(M.login.signingIn) : t(M.login.titleSignin)}
                </Button>

                {authMode === "demo" ? (
                  <>
                    <div className="flex items-center gap-3 text-[10px] text-muted">
                      <span className="h-px flex-1 bg-line" />
                      {t(M.login.orDivider)}
                      <span className="h-px flex-1 bg-line" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={busy !== null}
                      onClick={loginWithFingerprint}
                    >
                      {busy === "biometric" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Fingerprint className="h-4 w-4 text-brand-600" />
                      )}
                      {busy === "biometric"
                        ? t(M.login.verifyingBiometric)
                        : t(M.login.biometricSignIn)}
                    </Button>
                    {!biometricReady ? (
                      <p className="text-[10px] leading-5 text-muted">
                        {t(M.login.biometricUnsupported)}
                      </p>
                    ) : null}
                  </>
                ) : null}

                {authMode === "demo" ? (
                  <div className="space-y-2 rounded-xl border border-line/80 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-ink">{t(M.login.clubSport)}</span>
                      <span className="text-[9px] text-muted">{t(M.login.demoSportNote)}</span>
                    </div>
                    <Segmented<Sport>
                      className="bg-white"
                      size="sm"
                      value={data.club.sport}
                      onChange={setSport}
                      options={SPORT_ORDER.map((sport) => ({
                        value: sport,
                        label: SPORT_LABELS[sport],
                      }))}
                    />
                  </div>
                ) : null}
              </form>
            ) : null}

            {view === "signup" && !needsSetup ? (
              <form onSubmit={submitSignup} className="mt-4 space-y-3.5">
                <Field label={t(M.login.fullName)}>
                  <Input
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t(M.login.phFullName)}
                  />
                </Field>
                <Field label={t(M.login.email)}>
                  <Input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@club.ir"
                    dir="ltr"
                    className="text-right ltr:text-left"
                  />
                </Field>
                <Field label={t(M.login.phoneOptional)} hint={t(M.login.phoneHint)}>
                  <Input
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="09123456789"
                    dir="ltr"
                    className="text-right ltr:text-left"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t(M.login.password)} hint={t(M.login.phMinChars)}>
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
                  <Field label={t(M.login.confirmPasswordFull)}>
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

                <Field label={t(M.login.membership)}>
                  <Segmented<"player" | "coach">
                    value={role}
                    onChange={setRole}
                    options={[
                      { value: "player", label: t(M.login.player) },
                      { value: "coach", label: t(M.login.coach) },
                    ]}
                  />
                </Field>

                {role === "player" ? (
                  <Field label={t(M.login.team)}
                    hint={t(M.login.teamOptional)}>
                    <Select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
                      <option value="">{t(M.login.noTeam)}</option>
                      {data.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name} · {team.ageGroup}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <Field label={t(M.login.coachExperience)}
                      hint={t(M.login.managerReviews)}>
                    <Textarea
                      rows={2}
                      value={requestNote}
                      onChange={(event) => setRequestNote(event.target.value)}
                      placeholder={t(M.login.phCoachExperience)}
                    />
                  </Field>
                )}

                {authMode === "cloud" ? (
                  <>
                    <Field label={t(M.login.inviteCode)} hint={t(M.login.inviteCodeHint)}>
                      <Input
                        required
                        value={inviteCode}
                        onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                        placeholder={t(M.login.phInviteCode)}
                        dir="ltr"
                        className="text-right font-mono tracking-widest ltr:text-left"
                      />
                    </Field>
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-700">
                      {t(role === "player" ? M.login.playerPendingNote : M.login.coachPendingNote)}
                    </p>
                  </>
                ) : null}

                <Button type="submit" className="w-full" disabled={busy !== null}>
                  {busy === "signup" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserRound className="h-4 w-4" />
                  )}
                  {busy === "signup" ? t(M.login.submitting) : t(M.login.tabSignup)}
                </Button>
              </form>
            ) : null}

            {view === "forgot" && !needsSetup ? (
              <form onSubmit={submitForgot} className="mt-4 space-y-3.5">
                <Field label={t(M.login.accountEmail)}>
                  <Input
                    required
                    type="email"
                    autoComplete="email"
                    value={forgotEmail}
                    onChange={(event) => setForgotEmail(event.target.value)}
                    placeholder="name@club.ir"
                    dir="ltr"
                    className="text-right ltr:text-left"
                  />
                </Field>
                <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-5 text-muted">
                  <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  {t(authMode === "cloud" ? M.login.resetHelpCloud : M.login.resetHelpDemo)}
                </div>
                <Button type="submit" className="w-full" disabled={busy !== null}>
                  {busy === "forgot" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {t(M.login.sendResetLink)}
                </Button>
                <button
                  type="button"
                  onClick={() => switchView("signin")}
                  className="flex w-full items-center justify-center gap-1 text-[11px] font-medium text-muted hover:text-ink"
                >
                  <ArrowRight className="h-3.5 w-3.5 ltr:rotate-180" />
                  {t(M.login.backToSignin)}
                </button>
              </form>
            ) : null}

            <p className="mt-5 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-5 text-muted">
              {t(authMode === "cloud" ? M.login.footerCloud : M.login.footerDemo)}
            </p>
          </div>

          <p className="mt-4 text-center text-[10px] text-white/40">
            {t(authMode === "demo" ? M.login.versionDemo : M.login.versionCloud)}
          </p>
        </div>
      </div>
    </div>
  );
}
