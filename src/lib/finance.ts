import type {
  BankAccount,
  ClubData,
  LedgerEntry,
  LedgerMethod,
  Payment,
  PaymentMethod,
  Product,
  StockMovement,
  TransactionKind,
} from "./types";
import {
  endOfJalaliMonth,
  previousJalaliMonth,
  shortMonthName,
  startOfJalaliMonth,
} from "./date";
import { M, tr } from "./i18n/messages";

export const TUITION_CATEGORY_ID = "cat-tuition";
export const CASH_ACCOUNT_ID = "acc-cash";
export const BANK_ACCOUNT_ID = "acc-bank";

export function accountById(data: ClubData, accountId: string) {
  return data.accounts.find((account) => account.id === accountId);
}

export function categoryName(data: ClubData, categoryId: string) {
  return data.categories.find((category) => category.id === categoryId)?.name ?? tr(M.finance.categoryFallback);
}

export function defaultAccountId(data: ClubData, method: PaymentMethod | LedgerMethod) {
  if (method === "cash") {
    return data.accounts.find((account) => account.id === CASH_ACCOUNT_ID)?.id
      ?? data.accounts.find((account) => account.kind === "cash" && account.active)?.id
      ?? data.accounts[0]?.id
      ?? "";
  }
  return data.accounts.find((account) => account.id === BANK_ACCOUNT_ID)?.id
    ?? data.accounts.find((account) => account.kind === "bank" && account.active)?.id
    ?? data.accounts[0]?.id
    ?? "";
}

function ledgerMethodOf(payment: Payment): LedgerMethod {
  if (payment.method === "gateway") return "card";
  return payment.method;
}

export function tuitionEntry(data: ClubData, payment: Payment): LedgerEntry {
  const invoice = data.invoices.find((row) => row.id === payment.invoiceId);
  const player = data.players.find((row) => row.id === payment.playerId);
  const method = ledgerMethodOf(payment);
  return {
    id: `ledger-tuition-${payment.id}`,
    kind: "income",
    categoryId: TUITION_CATEGORY_ID,
    accountId: payment.accountId ?? defaultAccountId(data, method),
    amount: payment.amount,
    method,
    date: payment.paidAt,
    title: invoice
      ? `${invoice.title} · ${player?.fullName ?? tr(M.common.playerWord)}`
      : `${tr(M.finance.tuitionPayment)} · ${player?.fullName ?? tr(M.common.playerWord)}`,
    party: player?.fullName,
    playerId: payment.playerId,
    source: "tuition",
    refId: payment.id,
    note: payment.reference ? tr(M.ledger.referenceNumber, { ref: payment.reference }) : undefined,
    createdAt: payment.paidAt,
  };
}

export function allLedgerEntries(data: ClubData): LedgerEntry[] {
  const stored = data.transactions ?? [];
  const derived = (data.payments ?? []).map((payment) => tuitionEntry(data, payment));
  return [...stored, ...derived].sort(
    (a, b) => +new Date(b.date) - +new Date(a.date),
  );
}

export function settledInBalance(entry: LedgerEntry) {
  return entry.method !== "cheque" || entry.cheque?.status === "cleared";
}

export function countsInTotals(entry: LedgerEntry) {
  return entry.method !== "cheque" || entry.cheque?.status !== "bounced";
}

export function accountBalance(data: ClubData, accountId: string, entries?: LedgerEntry[]) {
  const account = accountById(data, accountId);
  if (!account) return 0;
  const rows = (entries ?? allLedgerEntries(data)).filter(
    (entry) => entry.accountId === accountId && settledInBalance(entry),
  );
  const flow = rows.reduce(
    (sum, entry) => sum + (entry.kind === "income" ? entry.amount : -entry.amount),
    0,
  );
  return account.openingBalance + flow;
}

export function accountInClearing(data: ClubData, accountId: string, entries?: LedgerEntry[]) {
  return (entries ?? allLedgerEntries(data))
    .filter(
      (entry) =>
        entry.accountId === accountId &&
        entry.method === "cheque" &&
        entry.cheque?.status === "pending",
    )
    .reduce((sum, entry) => sum + (entry.kind === "income" ? entry.amount : -entry.amount), 0);
}

export function totalBankBalance(data: ClubData, entries?: LedgerEntry[]) {
  const rows = entries ?? allLedgerEntries(data);
  return data.accounts
    .filter((account) => account.active)
    .reduce((sum, account) => sum + accountBalance(data, account.id, rows), 0);
}

export interface FlowTotals {
  income: number;
  expense: number;
  net: number;
}

export function ledgerTotals(entries: LedgerEntry[]): FlowTotals {
  const counted = entries.filter(countsInTotals);
  const income = counted
    .filter((entry) => entry.kind === "income")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const expense = counted
    .filter((entry) => entry.kind === "expense")
    .reduce((sum, entry) => sum + entry.amount, 0);
  return { income, expense, net: income - expense };
}

export function entriesInMonth(entries: LedgerEntry[], date: Date) {
  const start = startOfJalaliMonth(date);
  const end = endOfJalaliMonth(start);
  return entries.filter((entry) => {
    const value = new Date(entry.date);
    return value >= start && value < end;
  });
}

export function entriesToday(entries: LedgerEntry[], now = new Date()) {
  return entries.filter((entry) => {
    const value = new Date(entry.date);
    return (
      value.getFullYear() === now.getFullYear() &&
      value.getMonth() === now.getMonth() &&
      value.getDate() === now.getDate()
    );
  });
}

export interface MonthlyFlowPoint {
  label: string;
  start: Date;
  income: number;
  expense: number;
}

export function monthlyFlow(
  entries: LedgerEntry[],
  months = 6,
  now = new Date(),
): MonthlyFlowPoint[] {
  const starts: Date[] = [];
  let cursor = startOfJalaliMonth(now);
  for (let i = 0; i < months; i += 1) {
    starts.unshift(cursor);
    cursor = previousJalaliMonth(cursor);
  }
  return starts.map((start) => {
    const end = endOfJalaliMonth(start);
    const totals = ledgerTotals(
      entries.filter((entry) => {
        const date = new Date(entry.date);
        return date >= start && date < end;
      }),
    );
    return {
      label: shortMonthName(start),
      start,
      income: totals.income,
      expense: totals.expense,
    };
  });
}

export function categoryTotals(
  entries: LedgerEntry[],
  kind: TransactionKind,
  categories: ClubData["categories"],
) {
  const totals = new Map<string, number>();
  entries
    .filter((entry) => entry.kind === kind && countsInTotals(entry))
    .forEach((entry) => {
      totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + entry.amount);
    });
  return [...totals.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      amount,
      name: categories.find((category) => category.id === categoryId)?.name ?? tr(M.finance.otherFallback),
    }))
    .sort((a, b) => b.amount - a.amount);
}

export interface ChequeRow {
  entry: LedgerEntry;
  direction: "received" | "issued";
  dueAt: string;
}

export function chequeRows(entries: LedgerEntry[]): ChequeRow[] {
  return entries
    .filter((entry) => entry.method === "cheque" && entry.cheque)
    .map((entry) => ({
      entry,
      direction: entry.kind === "income" ? ("received" as const) : ("issued" as const),
      dueAt: entry.cheque?.dueAt ?? entry.date,
    }))
    .sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
}

export function pendingCheques(entries: LedgerEntry[]) {
  return chequeRows(entries).filter((row) => row.entry.cheque?.status === "pending");
}

export interface CreditRow {
  entry: LedgerEntry;
  movement?: StockMovement;
}

export function creditRows(data: ClubData, entries?: LedgerEntry[]): CreditRow[] {
  const rows = entries ?? allLedgerEntries(data);
  return rows
    .filter((entry) => entry.credit && entry.settled === false)
    .map((entry) => ({
      entry,
      movement: data.stockMovements.find((mv) => mv.ledgerId === entry.id),
    }))
    .sort((a, b) => +new Date(a.entry.date) - +new Date(b.entry.date));
}

export function inventoryValue(products: Product[]) {
  return products.reduce((sum, product) => sum + product.stock * product.costPrice, 0);
}

export function lowStockProducts(products: Product[]) {
  return products.filter(
    (product) => product.active && product.stock <= product.minStock,
  );
}

export function productSaleCategoryId(product: Product) {
  if (product.category === "clothing") return "cat-sale-clothing";
  if (product.category === "equipment") return "cat-sale-equipment";
  return "cat-sale-other";
}

export function productPurchaseCategoryId(product: Product) {
  if (product.category === "clothing") return "cat-purchase-clothing";
  if (product.category === "equipment") return "cat-purchase-equipment";
  return "cat-purchase-other";
}

export function maskCard(card?: string) {
  if (!card) return "";
  const clean = card.replace(/\D/g, "");
  if (clean.length < 8) return clean;
  return `${clean.slice(0, 4)} **** ${clean.slice(-4)}`;
}

export function maskAccount(account?: string) {
  if (!account) return "";
  const clean = account.replace(/\s+/g, "");
  if (clean.length <= 4) return clean;
  return `${"*".repeat(Math.max(clean.length - 4, 0))}${clean.slice(-4)}`;
}

export function activeAccounts(accounts: BankAccount[]) {
  return accounts.filter((account) => account.active);
}

export function accountName(account?: BankAccount) {
  if (!account) return tr(M.finance.unknownAccount);
  return account.kind === "bank" && account.bankName
    ? `${account.name} · ${account.bankName}`
    : account.name;
}
