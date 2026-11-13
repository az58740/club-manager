"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createEmptyData,
  createSeedData,
  DEMO_ACCOUNT_IDS,
  DEMO_DATA_VERSION,
} from "./seed";
import { remapPosition } from "./labels";
import { faNum } from "./format";
import { ApiError, getSession, isApiConfigured, onSessionChange } from "./api";
import {
  bootstrapClub as bootstrapClubRequest,
  changePassword as changePasswordRequest,
  completePasswordReset as completePasswordResetRequest,
  createMember as createMemberRequest,
  fetchProfile,
  fetchProfiles,
  linkPlayerAccount,
  mapClub,
  resetMemberPassword,
  reviewUserRequest,
  sendPasswordResetEmail,
  signIn,
  signOut,
  signUp,
  type CreateMemberInput,
} from "./cloud-auth";
import {
  clearLocalCredentials,
  ensureLocalCredentials,
  generateTempPassword,
  hasLocalPassword,
  pruneLocalCredentials,
  setLocalPassword,
  verifyLocalPassword,
} from "./local-auth";
import {
  forgetClub,
  joinSharedClub as joinSharedClubRequest,
  rotateClubCode as rotateClubCodeRequest,
  type SyncState,
} from "./record-sync";
import { useRecordSync } from "./use-record-sync";
import { useLocale } from "./i18n/locale";
import { M, tr } from "./i18n/messages";
import {
  getLocalItemMigrating,
  requestPersistentStorage,
  setLocalItemWithFallback,
} from "./offline-storage";
import {
  emailTaken,
  findUserByEmail,
  normalizeEmail,
  normalizePhone,
  signInEmail,
} from "./identifier";
import type { AppUser, ClubData, Role, Sport } from "./types";

const DATA_KEY = `valibal-club-data-v${DEMO_DATA_VERSION}-fresh-start`;
const SESSION_KEY = "valibal-club-session-v1";
const PROFILE_KEY = "valibal-cloud-profile-v1";

/** Last account the server confirmed on this phone, for opening the app offline. */
function cachedProfile(): AppUser | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AppUser) : null;
    return parsed?.id && parsed.status === "active" ? parsed : null;
  } catch {
    return null;
  }
}

export type ToastTone = "success" | "error" | "info";

export type AuthMode = "cloud" | "demo";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface AuthResult {
  ok: boolean;
  reason?: "invalid" | "pending" | "rejected" | "error";
  message?: string;
  /** Machine-readable failure so the UI never matches on translated text. */
  code?: string;
}

export interface SignupInput {
  name: string;
  email: string;
  /** Contact number, stored alongside the account but never used to sign in. */
  phone?: string;
  password: string;
  role: "manager" | "coach" | "player";
  teamId?: string;
  requestNote?: string;
  inviteCode?: string;
}

export interface SignupResult extends AuthResult {
  pending?: boolean;
  loggedIn?: boolean;
}

/** What the manager hands over after creating an account: the sign-in address
 *  and, when the server minted one, the password shown exactly once. */
export interface MemberResult extends AuthResult {
  tempPassword?: string;
  email?: string;
  phone?: string;
}

/** The server answers in English; the reason code drives the UI, the message is read. */
function authFailure(error: unknown, fallback: string): AuthResult {
  if (!(error instanceof ApiError)) {
    return {
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message : fallback,
    };
  }
  const detail = (error.detail ?? "").toLowerCase();
  if (detail.includes("has not approved")) {
    return { ok: false, reason: "pending", message: error.message };
  }
  if (detail.includes("was rejected") || detail.includes("not active")) {
    return { ok: false, reason: "rejected", message: error.message };
  }
  if (detail.includes("confirm your email")) {
    return { ok: false, reason: "invalid", code: "email_unconfirmed", message: error.message };
  }
  if (detail.includes("email or password is wrong")) {
    return { ok: false, reason: "invalid", message: error.message };
  }
  if (detail.includes("current password is wrong")) {
    return { ok: false, reason: "invalid", message: error.message };
  }
  return { ok: false, reason: "error", message: error.message };
}

interface ClubContextValue {
  data: ClubData;
  ready: boolean;
  authMode: AuthMode;
  currentUser: AppUser | null;
  role: Role | null;
  isManager: boolean;
  isCoach: boolean;
  isPlayer: boolean;
  update: (mutator: (data: ClubData) => ClubData) => void;
  setSport: (sport: Sport) => void;
  resetDemo: () => void;
  clearClubRecords: () => void;
  restoreBackup: (input: { raw: string; password: string }) => Promise<AuthResult>;
  bootstrapClub: (input: {
    clubName: string;
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    sport: Sport;
  }) => Promise<SignupResult>;
  login: (email: string, password: string) => Promise<AuthResult>;
  loginDemo: (userId: string) => void;
  signup: (input: SignupInput) => Promise<SignupResult>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  completePasswordReset: (token: string, newPassword: string) => Promise<AuthResult>;
  directoryUsers: AppUser[];
  pendingUsers: AppUser[];
  refreshDirectory: () => Promise<void>;
  reviewUser: (userId: string, approve: boolean) => Promise<AuthResult>;
  createMember: (input: CreateMemberInput) => Promise<MemberResult>;
  linkPlayer: (userId: string, playerId: string) => Promise<AuthResult>;
  resetUserPassword: (userId: string) => Promise<MemberResult>;
  sync: SyncState;
  syncNow: () => Promise<void>;
  joinSharedClub: (code: string) => Promise<AuthResult>;
  rotateInviteCode: () => Promise<AuthResult>;
  toasts: Toast[];
  toast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
}

const ClubContext = createContext<ClubContextValue | null>(null);

// A stored or restored file can be older than the model, so every collection is
// filled in here instead of trusting the JSON shape.
function normalizeData(parsed: ClubData, fallback: ClubData): ClubData {
  const list = <T,>(value: T[] | undefined) => (Array.isArray(value) ? value : undefined);
  return {
    ...parsed,
    club: parsed.club ?? fallback.club,
    teams: list(parsed.teams) ?? [],
    players: list(parsed.players) ?? [],
    events: list(parsed.events) ?? [],
    attendance: list(parsed.attendance) ?? [],
    stats: list(parsed.stats) ?? [],
    invoices: list(parsed.invoices) ?? [],
    payments: list(parsed.payments) ?? [],
    categories:
      list(parsed.categories)?.length ? parsed.categories : fallback.categories,
    accounts: list(parsed.accounts)?.length ? parsed.accounts : fallback.accounts,
    transactions: list(parsed.transactions) ?? [],
    products: list(parsed.products) ?? [],
    stockMovements: list(parsed.stockMovements) ?? [],
    users: list(parsed.users)?.map((user) => ({ ...user, status: user.status ?? "active" })) ?? [],
  };
}

export function ClubProvider({ children }: { children: ReactNode }) {
  // Labels, dates and money read the language as they render, so switching has to
  // repaint everything below the provider.
  useLocale();

  const authMode: AuthMode = isApiConfigured ? "cloud" : "demo";
  const [data, setData] = useState<ClubData>(() => createEmptyData());
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [cloudUser, setCloudUser] = useState<AppUser | null>(null);
  const [managedUsers, setManagedUsers] = useState<AppUser[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const {
    state: sync,
    syncNow,
    refreshClubInfo,
  } = useRecordSync({
    enabled: authMode === "cloud",
    dataReady,
    clubId: cloudUser?.clubId ?? null,
    data,
    setData,
  });

  const mirrorKey =
    authMode === "cloud" ? (cloudUser ? `${DATA_KEY}:${cloudUser.id}` : null) : DATA_KEY;

  /**
   * Every account gets its own mirror on the phone. A player who signs in after
   * the manager must not keep reading rows the server never sent them, and the
   * manager must not lose their place when someone else uses the same device.
   */
  const adoptCloudUser = useCallback(async (profile: AppUser) => {
    const fallback = createEmptyData();
    let next = fallback;
    try {
      const raw = await getLocalItemMigrating(`${DATA_KEY}:${profile.id}`);
      const parsed = raw ? (JSON.parse(raw) as ClubData) : null;
      if (parsed && typeof parsed === "object") next = normalizeData(parsed, fallback);
    } catch {
      next = fallback;
    }
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // the mirror still works; only the offline sign-in shortcut is lost
    }
    setData(next);
    setCloudUser(profile);
  }, []);

  useEffect(() => {
    // Missing collections in a stored file are filled from the empty club, never from
    // the sample data, so a real device cannot inherit demo accounts or balances.
    const fallback = createEmptyData();
    let next: ClubData = fallback;
    let cancelled = false;
    void (async () => {
      if (authMode === "demo") {
        try {
          const raw = await getLocalItemMigrating(DATA_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as ClubData;
            if (parsed && typeof parsed === "object") next = normalizeData(parsed, fallback);
          }
          const session = localStorage.getItem(SESSION_KEY);
          if (session && next.users.some((user) => user.id === session)) setSessionUserId(session);
          else if (session) localStorage.removeItem(SESSION_KEY);
        } catch {
          // Continue with an empty club if local storage needs recovery.
        }
      }
      if (!cancelled) {
        setData(next);
        setDataReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authMode]);

  useEffect(() => {
    if (dataReady) void requestPersistentStorage();
  }, [dataReady]);

  useEffect(() => {
    if (!dataReady) return;
    let cancelled = false;

    if (authMode === "demo") {
      void ensureLocalCredentials(
        data.users.filter((user) => DEMO_ACCOUNT_IDS.includes(user.id)),
      )
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setAuthReady(true);
        });
      return () => {
        cancelled = true;
      };
    }

    // A token on this phone is only a claim; the server decides whether the
    // account behind it is still active before any club data is shown.
    void (async () => {
      if (getSession()) {
        try {
          const profile = await fetchProfile();
          if (cancelled) return;
          if (profile?.status === "active") adoptCloudUser(profile);
          else await signOut();
        } catch (error) {
          if (cancelled) return;
          const status = error instanceof ApiError ? error.status : 0;
          if (status === 401 || status === 403) {
            await signOut();
          } else {
            // No answer from the server is not a sign-out: open the mirror this
            // account already has and let the queue drain when the network returns.
            const cached = cachedProfile();
            if (cached) adoptCloudUser(cached);
          }
        }
      }
      if (!cancelled) setAuthReady(true);
    })();

    const unsubscribe = onSessionChange((next) => {
      if (next || cancelled) return;
      setCloudUser(null);
      setManagedUsers([]);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // Data users are only needed for the initial demo credential bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, authMode, adoptCloudUser]);

  useEffect(() => {
    if (!dataReady || !mirrorKey) return;
    try {
      void setLocalItemWithFallback(mirrorKey, JSON.stringify(data)).catch(() => undefined);
    } catch {
      // storage can be unavailable in private mode; the app still works in memory
    }
  }, [data, dataReady, mirrorKey]);

  const update = useCallback((mutator: (current: ClubData) => ClubData) => {
    setData((current) => mutator(current));
  }, []);

  const setSport = useCallback(
    (sport: Sport) => {
      update((current) => {
        if (current.club.sport === sport) return current;
        return {
          ...current,
          club: { ...current.club, sport },
          players: current.players.map((player) => ({
            ...player,
            position: remapPosition(player.position, sport),
          })),
        };
      });
    },
    [update],
  );

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const currentUser = useMemo(() => {
    if (authMode === "cloud") return cloudUser;
    return data.users.find((user) => user.id === sessionUserId) ?? null;
  }, [authMode, cloudUser, data.users, sessionUserId]);

  const role = currentUser?.role ?? null;
  const isManager = role === "manager";
  const isCoach = role === "coach";
  const isPlayer = role === "player";

  const loginDemo = useCallback(
    (userId: string) => {
      if (authMode !== "demo") return;
      const user = data.users.find((row) => row.id === userId);
      if (!user || user.status !== "active") return;
      localStorage.setItem(SESSION_KEY, userId);
      setSessionUserId(userId);
    },
    [authMode, data.users],
  );

  const login = useCallback(
    async (rawEmail: string, password: string): Promise<AuthResult> => {
      const email = signInEmail(rawEmail);
      if (!rawEmail.trim() || !password) {
        return { ok: false, reason: "invalid", message: tr(M.store.emailPasswordRequired) };
      }
      if (!email) {
        return { ok: false, reason: "invalid", message: tr(M.store.invalidEmail) };
      }
      const known = findUserByEmail([...data.users, ...managedUsers], rawEmail);

      if (authMode === "cloud") {
        try {
          const profile = await signIn(email, password);
          adoptCloudUser(profile);
          if (profile.role === "manager") {
            void fetchProfiles()
              .then(setManagedUsers)
              .catch(() => undefined);
          }
          return { ok: true };
        } catch (error) {
          return authFailure(error, tr(M.store.unexpectedSignIn));
        }
      }

      const user = known;
      if (!user) {
        return { ok: false, reason: "invalid", message: tr(M.store.badCredentials) };
      }
      if (user.status === "pending") {
        return {
          ok: false,
          reason: "pending",
          message: tr(M.store.pendingApproval),
        };
      }
      if (user.status === "rejected") {
        return {
          ok: false,
          reason: "rejected",
          message: tr(M.store.rejectedAccess),
        };
      }
      // Password hashes live in their own storage key, so a restored backup can hold
      // accounts this device has never set a password for. Saying "wrong password"
      // there sends the manager hunting; name the real state instead.
      if (!hasLocalPassword(user.id)) {
        return {
          ok: false,
          reason: "invalid",
          code: "no_password",
          message: tr(M.store.noPasswordOnDevice),
        };
      }
      const valid = await verifyLocalPassword(user.id, password);
      if (!valid) {
        return { ok: false, reason: "invalid", message: tr(M.store.badCredentials) };
      }
      localStorage.setItem(SESSION_KEY, user.id);
      setSessionUserId(user.id);
      return { ok: true };
    },
    [adoptCloudUser, authMode, data.users, managedUsers],
  );

  const signup = useCallback(
    async (input: SignupInput): Promise<SignupResult> => {
      const name = input.name.trim();
      const email = signInEmail(input.email);
      const phone = normalizePhone(input.phone ?? "");
      if (!name || !email || input.password.length < 6) {
        return {
          ok: false,
          reason: "error",
          message: email ? tr(M.store.signupFieldsRequired) : tr(M.store.invalidEmail),
        };
      }

      if (authMode === "cloud") {
        try {
          const outcome = await signUp({
            email,
            password: input.password,
            fullName: name,
            phone: phone || undefined,
            role: input.role,
            code: input.inviteCode?.trim() || undefined,
            teamId: input.teamId,
            requestNote: input.requestNote?.trim() || undefined,
          });
          if (outcome.signedIn && outcome.user) {
            adoptCloudUser(outcome.user);
            return { ok: true, loggedIn: true };
          }
          if (outcome.pending) {
            return { ok: true, pending: true, message: tr(M.store.accountCreatedPending) };
          }
          return { ok: true, message: tr(M.store.accountCreatedConfirmEmail) };
        } catch (error) {
          return authFailure(error, tr(M.store.signupFailed));
        }
      }

      if (emailTaken(data.users, email)) {
        return {
          ok: false,
          reason: "error",
          message: tr(M.store.emailTaken),
        };
      }

      const user: AppUser = {
        id: `u-${Date.now().toString(36)}`,
        name,
        email,
        phone: phone || undefined,
        role: input.role,
        status: input.role === "coach" ? "pending" : "active",
        teamId: input.teamId,
        requestNote: input.requestNote?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      try {
        await setLocalPassword(user.id, input.password);
      } catch {
        return {
          ok: false,
          reason: "error",
          message: tr(M.store.localPasswordSaveFailed),
        };
      }
      update((current) => ({ ...current, users: [...current.users, user] }));

      if (user.status === "active") {
        localStorage.setItem(SESSION_KEY, user.id);
        setSessionUserId(user.id);
        return { ok: true, loggedIn: true };
      }
      return {
        ok: true,
        pending: true,
        message:
          tr(M.store.requestRegistered),
      };
    },
    [adoptCloudUser, authMode, data.users, update],
  );

  const logout = useCallback(async () => {
    if (authMode === "cloud") {
      await signOut();
      setCloudUser(null);
      setManagedUsers([]);
      return;
    }
    localStorage.removeItem(SESSION_KEY);
    setSessionUserId(null);
  }, [authMode]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<AuthResult> => {
      if (!currentUser) {
        return { ok: false, reason: "error", message: tr(M.store.signInFirst) };
      }
      if (newPassword.length < 6) {
        return { ok: false, reason: "error", message: tr(M.store.newPasswordShort) };
      }
      if (newPassword === currentPassword) {
        return { ok: false, reason: "error", message: tr(M.store.sameAsCurrent) };
      }

      if (authMode === "cloud") {
        try {
          const profile = await changePasswordRequest(currentPassword, newPassword);
          // The server hands back a session for this phone and revokes the others.
          setCloudUser(profile);
          return { ok: true, message: tr(M.store.passwordChanged) };
        } catch (error) {
          return authFailure(error, tr(M.store.passwordChangeFailed));
        }
      }

      const valid = await verifyLocalPassword(currentUser.id, currentPassword);
      if (!valid) {
        return { ok: false, reason: "invalid", message: tr(M.store.wrongCurrentPassword) };
      }
      try {
        await setLocalPassword(currentUser.id, newPassword);
      } catch {
        return { ok: false, reason: "error", message: tr(M.store.saveNewPasswordFailed) };
      }
      return { ok: true, message: tr(M.store.passwordChanged) };
    },
    [authMode, currentUser],
  );

  const requestPasswordReset = useCallback(
    async (rawEmail: string): Promise<AuthResult> => {
      const email = signInEmail(rawEmail);
      if (!email) {
        return { ok: false, reason: "error", message: tr(M.store.invalidEmail) };
      }
      if (authMode !== "cloud") {
        // Sending a code needs an SMS gateway and a server, and the exported build
        // has neither, so the manager issues the new password until one is wired up.
        return {
          ok: false,
          reason: "error",
          code: "sms_not_configured",
          message:
            tr(M.store.resetViaManager),
        };
      }
      try {
        await sendPasswordResetEmail(email);
        return {
          ok: true,
          message: tr(M.store.resetEmailSent),
        };
      } catch (error) {
        return {
          ok: false,
          reason: "error",
          message: error instanceof Error ? error.message : tr(M.store.resetEmailFailed),
        };
      }
    },
    [authMode],
  );

  const completePasswordReset = useCallback(
    async (token: string, newPassword: string): Promise<AuthResult> => {
      if (newPassword.length < 6) {
        return { ok: false, reason: "error", message: tr(M.store.newPasswordShort) };
      }
      if (authMode !== "cloud") {
        return { ok: false, reason: "error", message: tr(M.store.cloudOnlyPage) };
      }
      if (!token.trim()) {
        return { ok: false, reason: "error", message: tr(M.store.resetTokenMissing) };
      }
      try {
        await completePasswordResetRequest(token.trim(), newPassword);
        await signOut();
        setCloudUser(null);
        return { ok: true, message: tr(M.store.passwordSet) };
      } catch (error) {
        return authFailure(error, tr(M.store.passwordSetFailed));
      }
    },
    [authMode],
  );

  const directoryUsers = useMemo(
    () => (authMode === "demo" ? data.users : managedUsers),
    [authMode, data.users, managedUsers],
  );

  const pendingUsers = useMemo(
    () => directoryUsers.filter((user) => user.status === "pending"),
    [directoryUsers],
  );

  const refreshDirectory = useCallback(async () => {
    if (authMode !== "cloud" || !isManager) return;
    setManagedUsers(await fetchProfiles());
  }, [authMode, isManager]);

  const reviewUser = useCallback(
    async (userId: string, approve: boolean): Promise<AuthResult> => {
      if (!isManager) {
        return { ok: false, reason: "error", message: tr(M.store.managerOnly) };
      }
      if (authMode === "cloud") {
        try {
          await reviewUserRequest(userId, approve);
          await refreshDirectory();
          return {
            ok: true,
            message: approve ? tr(M.store.coachApproved) : tr(M.store.coachRejected),
          };
        } catch (error) {
          return authFailure(error, tr(M.sync.saveFailed));
        }
      }
      const target = data.users.find((user) => user.id === userId);
      if (!target) {
        return { ok: false, reason: "error", message: tr(M.store.userNotFound) };
      }
      update((current) => ({
        ...current,
        users: current.users.map((user) =>
          user.id === userId
            ? { ...user, status: approve ? "active" : "rejected" }
            : user,
        ),
      }));
      return {
        ok: true,
        message: approve ? tr(M.store.coachApproved) : tr(M.store.coachRejected),
      };
    },
    [authMode, data.users, isManager, refreshDirectory, update],
  );

  const createMember = useCallback(
    async (input: CreateMemberInput): Promise<MemberResult> => {
      if (!isManager) {
        return { ok: false, reason: "error", message: tr(M.store.managerOnly) };
      }
      const name = input.name.trim();
      const email = signInEmail(input.email);
      const phone = normalizePhone(input.phone ?? "");
      if (!name || !email) {
        return {
          ok: false,
          reason: "error",
          message: name ? tr(M.store.invalidEmail) : tr(M.store.coachNameEmailRequired),
        };
      }

      if (authMode === "cloud") {
        try {
          const result = await createMemberRequest({
            ...input,
            name,
            email,
            phone: phone || undefined,
            password: input.password?.trim() || undefined,
          });
          await refreshDirectory();
          return {
            ok: true,
            tempPassword: result.tempPassword,
            email,
            phone: phone || undefined,
            message: tr(M.store.memberAccountCreated),
          };
        } catch (error) {
          return authFailure(error, tr(M.store.memberCreateFailed));
        }
      }

      if (emailTaken(data.users, email)) {
        return {
          ok: false,
          reason: "error",
          message: tr(M.store.emailTaken),
        };
      }
      const tempPassword = input.password?.trim() || generateTempPassword();
      if (tempPassword.length < 6) {
        return { ok: false, reason: "error", message: tr(M.store.tempPasswordShort) };
      }
      const user: AppUser = {
        id: `u-${Date.now().toString(36)}`,
        name,
        email,
        phone: phone || undefined,
        role: input.role,
        status: "active",
        teamId: input.teamId,
        playerId: input.playerId,
        createdAt: new Date().toISOString(),
      };
      try {
        await setLocalPassword(user.id, tempPassword);
      } catch {
        return { ok: false, reason: "error", message: tr(M.store.tempPasswordSaveFailed) };
      }
      update((current) => ({ ...current, users: [...current.users, user] }));
      return {
        ok: true,
        tempPassword,
        email,
        phone: phone || undefined,
        message: tr(M.store.memberAccountCreated),
      };
    },
    [authMode, data.users, isManager, refreshDirectory, update],
  );

  const linkPlayer = useCallback(
    async (userId: string, playerId: string): Promise<AuthResult> => {
      if (!isManager) {
        return { ok: false, reason: "error", message: tr(M.store.managerOnly) };
      }
      if (authMode !== "cloud") {
        update((current) => ({
          ...current,
          users: current.users.map((user) =>
            user.id === userId
              ? { ...user, playerId, teamId: current.players.find((p) => p.id === playerId)?.teamId }
              : user,
          ),
        }));
        return { ok: true, message: tr(M.store.playerLinked) };
      }
      try {
        const profile = await linkPlayerAccount(userId, playerId);
        setManagedUsers((current) =>
          current.map((user) => (user.id === profile.id ? profile : user)),
        );
        return { ok: true, message: tr(M.store.playerLinked) };
      } catch (error) {
        return authFailure(error, tr(M.store.playerLinkFailed));
      }
    },
    [authMode, isManager, update],
  );

  const resetUserPassword = useCallback(
    async (userId: string): Promise<MemberResult> => {
      if (!isManager) {
        return { ok: false, reason: "error", message: tr(M.store.managerOnly) };
      }
      const target = directoryUsers.find((user) => user.id === userId);
      if (!target) {
        return { ok: false, reason: "error", message: tr(M.store.userNotFound) };
      }
      if (authMode === "cloud") {
        try {
          const result = await resetMemberPassword(userId);
          return {
            ok: true,
            tempPassword: result.tempPassword,
            email: target.email,
            message: tr(M.store.tempPasswordSet),
          };
        } catch (error) {
          return authFailure(error, tr(M.store.userResetLinkFailed));
        }
      }
      const tempPassword = generateTempPassword();
      try {
        await setLocalPassword(target.id, tempPassword);
      } catch {
        return { ok: false, reason: "error", message: tr(M.store.tempPasswordSaveFailed) };
      }
      return {
        ok: true,
        tempPassword,
        email: target.email,
        message: tr(M.store.tempPasswordSet),
      };
    },
    [authMode, directoryUsers, isManager],
  );

  const joinSharedClub = useCallback(
    async (code: string): Promise<AuthResult> => {
      if (authMode !== "cloud") {
        return {
          ok: false,
          reason: "error",
          message: tr(M.store.cloudOnlySync),
        };
      }
      if (!cloudUser) {
        return { ok: false, reason: "error", message: tr(M.store.signInToJoinClub) };
      }
      const normalized = code.trim().toUpperCase();
      if (!normalized) {
        return { ok: false, reason: "invalid", message: tr(M.store.inviteCodeRequired) };
      }
      try {
        const club = await joinSharedClubRequest(normalized);
        const profile = await fetchProfile();
        if (!profile) throw new Error(tr(M.store.profileUpdateFailed));
        // The cursor and the queue belong to the club this account just left.
        if (cloudUser.clubId && cloudUser.clubId !== profile.clubId) {
          forgetClub(cloudUser.clubId);
        }
        adoptCloudUser(profile);
        return {
          ok: true,
          message: tr(M.store.joinedClub, { name: club.name }),
        };
      } catch (error) {
        return authFailure(error, tr(M.settings.joinFailed));
      }
    },
    [adoptCloudUser, authMode, cloudUser],
  );

  const rotateInviteCode = useCallback(async (): Promise<AuthResult> => {
    if (!isManager) {
      return { ok: false, reason: "error", message: tr(M.store.managerOnly) };
    }
    try {
      const code = await rotateClubCodeRequest();
      await refreshClubInfo();
      return { ok: true, message: tr(M.store.newInviteCode, { code }) };
    } catch (error) {
      return {
        ok: false,
        reason: "error",
        message: error instanceof Error ? error.message : tr(M.settings.rotateFailed),
      };
    }
  }, [isManager, refreshClubInfo]);

  const resetDemo = useCallback(() => {
    const seed = createSeedData();
    void setLocalItemWithFallback(DATA_KEY, JSON.stringify(seed)).catch(() => undefined);
    if (authMode === "demo") {
      clearLocalCredentials();
      void ensureLocalCredentials(seed.users);
    }
    setData(seed);
    toast(tr(M.store.demoResetDone), "info");
  }, [authMode, toast]);

  // first run on a device with no club data: create the club and its manager account
  const bootstrapClub = useCallback(
    async (input: {
      clubName: string;
      fullName: string;
      email: string;
      phone?: string;
      password: string;
      sport: Sport;
    }): Promise<SignupResult> => {
      const clubName = input.clubName.trim();
      const name = input.fullName.trim();
      const email = signInEmail(input.email);
      const phone = normalizePhone(input.phone ?? "");
      if (!clubName || !name || !email || input.password.length < 6) {
        return {
          ok: false,
          reason: "invalid",
          message: email ? tr(M.store.bootstrapFieldsRequired) : tr(M.store.invalidEmail),
        };
      }

      if (authMode === "cloud") {
        try {
          const result = await bootstrapClubRequest({
            email,
            password: input.password,
            fullName: name,
            phone: phone || undefined,
            clubName,
            shortName: clubName.split(/\s+/)[0] ?? clubName,
            sport: input.sport,
          });
          adoptCloudUser(result.user);
          // The club the server just created is the profile this phone starts from.
          setData((current) => ({ ...current, club: mapClub(result.club) }));
          return { ok: true, loggedIn: true };
        } catch (error) {
          return authFailure(error, tr(M.store.signupFailed));
        }
      }

      const user: AppUser = {
        id: `u-${Date.now().toString(36)}`, 
        name,
        email,
        phone,
        role: "manager",
        status: "active",
        createdAt: new Date().toISOString(),
      };

      try {
        await setLocalPassword(user.id, input.password);
      } catch {
        return {
          ok: false,
          reason: "error",
          message: tr(M.store.localPasswordSaveFailed),
        };
      }

      setData((current) => ({
        ...current,
        club: {
          ...current.club,
          name: clubName,
          shortName: clubName.split(/\s+/)[0] ?? clubName,
          sport: input.sport,
        },
        // A device can reach this screen with records already on it — a restore, or a
        // club left without a manager — so the new account joins what is there.
        users: [...current.users, user],
      }));
      localStorage.setItem(SESSION_KEY, user.id);
      setSessionUserId(user.id);
      return { ok: true };
    },
    [adoptCloudUser, authMode],
  );

  const clearClubRecords = useCallback(() => {
    setData((current) => ({
      ...createEmptyData(),
      club: current.club,
      users: current.users,
    }));
    toast(tr(M.store.recordsCleared), "info");
  }, [toast]);

  // A backup carries the accounts but never the password hashes, so a restore has to
  // be given a fresh manager password or the club would be locked out of its own data.
  const restoreBackup = useCallback(
    async (input: { raw: string; password: string }): Promise<AuthResult> => {
      if (authMode !== "demo") {
        return { ok: false, reason: "error", message: tr(M.store.restoreCloudBlocked) };
      }
      if (!isManager) {
        return { ok: false, reason: "error", message: tr(M.store.restoreManagerOnly) };
      }
      if (input.password.length < 6) {
        return { ok: false, reason: "invalid", message: tr(M.store.restorePasswordShort) };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(input.raw);
      } catch {
        return { ok: false, reason: "invalid", message: tr(M.store.restoreBadFile) };
      }
      if (!parsed || typeof parsed !== "object" || !("club" in parsed) || !("users" in parsed)) {
        return { ok: false, reason: "invalid", message: tr(M.store.restoreBadFile) };
      }
      const next = normalizeData(parsed as ClubData, createEmptyData());
      // The person restoring is the manager already signed in; find that same account
      // in the file by its sign-in address, and fall back to any active manager.
      const email = normalizeEmail(currentUser?.email ?? "");
      const manager =
        next.users.find(
          (user) => user.role === "manager" && normalizeEmail(user.email) === email,
        ) ?? next.users.find((user) => user.role === "manager" && user.status === "active");
      if (!manager) {
        return { ok: false, reason: "invalid", message: tr(M.store.restoreNoManager) };
      }
      try {
        await setLocalPassword(manager.id, input.password);
      } catch {
        return { ok: false, reason: "error", message: tr(M.store.restorePasswordFailed) };
      }
      try {
        await setLocalItemWithFallback(DATA_KEY, JSON.stringify(next));
      } catch {
        return { ok: false, reason: "error", message: tr(M.store.restoreSaveFailed) };
      }
      // The file defines the account set, so hashes left over from accounts it does not
      // contain are dropped instead of piling up on the device.
      pruneLocalCredentials(next.users.map((user) => user.id));
      setData(next);
      localStorage.setItem(SESSION_KEY, manager.id);
      setSessionUserId(manager.id);
      return {
        ok: true,
        message: tr(M.store.restoreDone, {
          players: faNum(next.players.length),
          teams: faNum(next.teams.length),
          users: faNum(next.users.filter((user) => user.id !== manager.id).length),
        }),
      };
    },
    [authMode, currentUser, isManager],
  );

  const ready = dataReady && authReady;

  const value = useMemo<ClubContextValue>(
    () => ({
      data,
      ready,
      authMode,
      currentUser,
      role,
      isManager,
      isCoach,
      isPlayer,
      update,
      setSport,
      resetDemo,
      clearClubRecords,
      restoreBackup,
      bootstrapClub,
      login,
      loginDemo,
      signup,
      logout,
      changePassword,
      requestPasswordReset,
      completePasswordReset,
      directoryUsers,
      pendingUsers,
      refreshDirectory,
      reviewUser,
      createMember,
      linkPlayer,
      resetUserPassword,
      sync,
      syncNow,
      joinSharedClub,
      rotateInviteCode,
      toasts,
      toast,
      dismissToast,
    }),
    [
      data,
      ready,
      authMode,
      currentUser,
      role,
      isManager,
      isCoach,
      isPlayer,
      update,
      setSport,
      resetDemo,
      clearClubRecords,
      restoreBackup,
      bootstrapClub,
      login,
      loginDemo,
      signup,
      logout,
      changePassword,
      requestPasswordReset,
      completePasswordReset,
      directoryUsers,
      pendingUsers,
      refreshDirectory,
      reviewUser,
      createMember,
      linkPlayer,
      resetUserPassword,
      sync,
      syncNow,
      joinSharedClub,
      rotateInviteCode,
      toasts,
      toast,
      dismissToast,
    ],
  );

  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

export function useClub() {
  const context = useContext(ClubContext);
  if (!context) throw new Error("useClub must be used inside ClubProvider");
  return context;
}
