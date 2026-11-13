export type Role = "manager" | "coach" | "player";

export type UserStatus = "active" | "pending" | "rejected";

export type PlayerStatus = "active" | "injured" | "inactive";

export type Sport = "volleyball" | "basketball" | "football";

export type Position =
  | "setter"
  | "outside"
  | "middle"
  | "opposite"
  | "libero"
  | "point-guard"
  | "shooting-guard"
  | "small-forward"
  | "power-forward"
  | "center"
  | "goalkeeper"
  | "defender"
  | "midfielder"
  | "forward"
  | "training";

export type TeamColor = "blue" | "amber" | "emerald" | "violet";

export type EventType = "training" | "match";

export type EventStatus = "scheduled" | "done" | "canceled";

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export type PaymentMethod = "card" | "cash" | "gateway" | "transfer";

export interface Team {
  id: string;
  name: string;
  ageGroup: string;
  coach: string;
  color: TeamColor;
  season: string;
  homeVenue: string;
}

export interface Player {
  id: string;
  fullName: string;
  phone: string;
  teamId: string;
  position: Position;
  jersey: number;
  birthDate: string;
  heightCm: number;
  status: PlayerStatus;
  joinedAt: string;
  monthlyFee: number;
  note?: string;
  address?: string;
  insured?: boolean;
}

export interface SetScore {
  home: number;
  away: number;
}

export interface ClubEvent {
  id: string;
  type: EventType;
  teamId: string;
  title: string;
  opponent?: string;
  location: string;
  startsAt: string;
  durationMin: number;
  status: EventStatus;
  notes?: string;
  reminderNote?: string;
  sets?: SetScore[];
}

export interface Attendance {
  id: string;
  eventId: string;
  playerId: string;
  status: AttendanceStatus;
}

export interface MatchStat {
  id: string;
  eventId: string;
  playerId: string;
  servePoints: number;
  attackPoints: number;
  blockPoints: number;
  digs: number;
  errors: number;
}

export type InvoiceKind = "tuition" | "tax";

export interface Invoice {
  id: string;
  playerId: string;
  kind: InvoiceKind;
  period: string;
  title: string;
  amount: number;
  dueAt: string;
  issuedAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  playerId: string;
  amount: number;
  paidAt: string;
  method: PaymentMethod;
  accountId?: string;
  reference?: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  /** Contact number in `09xxxxxxxxx` form; stored and shown, never used to sign in. */
  phone?: string;
  role: Role;
  status: UserStatus;
  teamId?: string;
  playerId?: string;
  authId?: string;
  clubId?: string;
  requestNote?: string;
  photo?: string;
  biometric?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface ClubProfile {
  name: string;
  shortName: string;
  sport: Sport;
  city: string;
  founded: string;
  phone: string;
  season: string;
  logo?: string;
}

/* --------------------------------- finance -------------------------------- */

export type TransactionKind = "income" | "expense";

export type TransactionSource = "manual" | "tuition" | "sale" | "purchase";

export type LedgerMethod = "cash" | "card" | "cheque" | "transfer" | "credit";

export type ChequeStatus = "pending" | "cleared" | "bounced";

export type AccountKind = "cash" | "bank";

export type ProductCategory = "clothing" | "equipment" | "other";

export interface ChequeInfo {
  number: string;
  bank: string;
  dueAt: string;
  status: ChequeStatus;
}

export interface FinanceCategory {
  id: string;
  name: string;
  kind: TransactionKind;
  system?: boolean;
}

export interface BankAccount {
  id: string;
  name: string;
  kind: AccountKind;
  bankName?: string;
  accountNumber?: string;
  cardNumber?: string;
  iban?: string;
  openingBalance: number;
  active: boolean;
}

export interface LedgerEntry {
  id: string;
  kind: TransactionKind;
  categoryId: string;
  accountId: string;
  amount: number;
  method: LedgerMethod;
  date: string;
  title: string;
  party?: string;
  playerId?: string;
  source: TransactionSource;
  refId?: string;
  cheque?: ChequeInfo;
  note?: string;
  credit?: boolean;
  settled?: boolean;
  settledAt?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  sku?: string;
  size?: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
  active: boolean;
}

export type StockMovementKind = "purchase" | "sale" | "adjustment";

export interface StockMovement {
  id: string;
  productId: string;
  kind: StockMovementKind;
  qty: number;
  unitPrice: number;
  date: string;
  party?: string;
  accountId?: string;
  method?: LedgerMethod;
  cheque?: ChequeInfo;
  ledgerId?: string;
  note?: string;
}

export interface ClubData {
  club: ClubProfile;
  teams: Team[];
  players: Player[];
  events: ClubEvent[];
  attendance: Attendance[];
  stats: MatchStat[];
  invoices: Invoice[];
  payments: Payment[];
  users: AppUser[];
  categories: FinanceCategory[];
  accounts: BankAccount[];
  transactions: LedgerEntry[];
  products: Product[];
  stockMovements: StockMovement[];
}
