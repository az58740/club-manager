import { api, getSession, post, setSession, type ApiClub, type ApiSession, type ApiUser } from "./api";
import { M, tr } from "./i18n/messages";
import type { AppUser, ClubProfile, Role, Sport } from "./types";

/**
 * Accounts live on the club server, not in the browser and not in a vendor's
 * auth service. Everything here is a thin call over /v1/auth and /v1/users; the
 * server decides what a role may do and answers with the stored row.
 */

export function mapUser(row: ApiUser): AppUser {
  return {
    id: row.id,
    authId: row.id,
    name: row.name?.trim() || row.email?.split("@")[0] || tr(M.cloud.fallbackName),
    email: row.email ?? "",
    phone: row.phone || undefined,
    role: row.role,
    status: row.status ?? "active",
    teamId: row.teamId || undefined,
    playerId: row.playerId || undefined,
    clubId: row.clubId || undefined,
    requestNote: row.requestNote || undefined,
    photo: row.photo || undefined,
    createdAt: row.createdAt || undefined,
    lastLoginAt: row.lastLoginAt || undefined,
  };
}

export function mapClub(row: ApiClub): ClubProfile {
  return {
    name: row.name ?? "",
    shortName: row.shortName ?? "",
    sport: (row.sport as Sport) || "volleyball",
    city: row.city ?? "",
    founded: row.founded ?? "",
    phone: row.phone ?? "",
    season: row.season ?? "",
    logo: row.logo || undefined,
  };
}

function adopt(result: ApiSession): AppUser {
  setSession(result);
  if (!result.user) throw new Error(tr(M.cloud.sessionExpired));
  return mapUser(result.user);
}

export async function signIn(email: string, password: string): Promise<AppUser> {
  return adopt(await post<ApiSession>("/v1/auth/sign-in", { email, password }, false));
}

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: Role;
  code?: string;
  teamId?: string;
  requestNote?: string;
}

export interface SignUpOutcome {
  signedIn: boolean;
  pending: boolean;
  emailVerificationSent: boolean;
  user: AppUser | null;
}

export async function signUp(input: SignUpInput): Promise<SignUpOutcome> {
  const result = await post<{
    session?: ApiSession | null;
    signedIn?: boolean;
    pending?: boolean;
    emailVerificationSent?: boolean;
  }>("/v1/auth/sign-up", input, false);

  if (result.session?.accessToken) {
    return {
      signedIn: true,
      pending: false,
      emailVerificationSent: Boolean(result.emailVerificationSent),
      user: adopt(result.session),
    };
  }
  return {
    signedIn: false,
    pending: Boolean(result.pending),
    emailVerificationSent: Boolean(result.emailVerificationSent),
    user: null,
  };
}

export interface BootstrapInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  clubName: string;
  shortName?: string;
  sport: Sport;
}

/** The first phone creates the club and its manager in one step. */
export async function bootstrapClub(
  input: BootstrapInput,
): Promise<{ user: AppUser; club: ApiClub }> {
  const result = await post<{ session: ApiSession; club: ApiClub }>(
    "/v1/auth/bootstrap",
    input,
    false,
  );
  return { user: adopt(result.session), club: result.club };
}

export async function signOut(): Promise<void> {
  const refreshToken = getSession()?.refreshToken;
  try {
    await post("/v1/auth/sign-out", { refreshToken }, false);
  } catch {
    // Signing out on this phone must work even when the server cannot be reached.
  }
  setSession(null);
}

export async function fetchProfile(): Promise<AppUser | null> {
  const row = await api<ApiUser>("/v1/me");
  return row?.id ? mapUser(row) : null;
}

export async function changePassword(currentPassword: string, password: string): Promise<AppUser> {
  return adopt(await post<ApiSession>("/v1/auth/password", { currentPassword, password }));
}

export async function resendConfirmationEmail(email: string) {
  await post("/v1/auth/resend-confirmation", { email }, false);
}

export async function sendPasswordResetEmail(email: string) {
  await post("/v1/auth/password-reset", { email }, false);
}

export async function verifyEmailToken(token: string) {
  await post("/v1/auth/verify-email", { token }, false);
}

export async function completePasswordReset(token: string, password: string) {
  await post("/v1/auth/password-reset/confirm", { token, password }, false);
}

export async function fetchProfiles(): Promise<AppUser[]> {
  const result = await api<{ users: ApiUser[] }>("/v1/users");
  return (result.users ?? []).map(mapUser);
}

export async function reviewUserRequest(userId: string, approve: boolean) {
  await post(`/v1/users/${encodeURIComponent(userId)}/review`, { approve });
}

export interface CreateMemberInput {
  name: string;
  email: string;
  phone?: string;
  role: "coach" | "player";
  password?: string;
  teamId?: string;
  playerId?: string;
}

export interface MemberOutcome {
  user: AppUser;
  tempPassword?: string;
}

/** The manager types the account in and hands over a password in person. */
export async function createMember(input: CreateMemberInput): Promise<MemberOutcome> {
  const result = await post<{ user: ApiUser; tempPassword?: string }>("/v1/users", input);
  return { user: mapUser(result.user), tempPassword: result.tempPassword || undefined };
}

export async function linkPlayerAccount(userId: string, playerId: string): Promise<AppUser> {
  const result = await post<{ user: ApiUser }>(
    `/v1/users/${encodeURIComponent(userId)}/link`,
    { playerId },
  );
  return mapUser(result.user);
}

export async function resetMemberPassword(userId: string): Promise<MemberOutcome> {
  const result = await post<{ user: ApiUser; tempPassword?: string }>(
    `/v1/users/${encodeURIComponent(userId)}/password`,
  );
  return { user: mapUser(result.user), tempPassword: result.tempPassword || undefined };
}
