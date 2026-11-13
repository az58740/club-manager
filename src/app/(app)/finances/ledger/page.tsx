"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Pencil,
  Plus,
  ReceiptText,
  Scale,
  SearchX,
  Tags,
  Trash2,
} from "lucide-react";
import { useClub } from "@/lib/store";
import {
  accountBalance,
  accountById,
  accountName,
  allLedgerEntries,
  categoryName,
  ledgerTotals,
  monthlyFlow,
  pendingCheques,
  totalBankBalance,
} from "@/lib/finance";
import { formatDateFull, formatMonthYear, addJalaliMonths, endOfJalaliMonth } from "@/lib/date";
import { compactToman, faNum, percent, toman } from "@/lib/format";
import {
  ACCOUNT_KIND_LABELS,
  CHEQUE_STATUS_LABELS,
  LEDGER_METHOD_LABELS,
  TRANSACTION_KIND_LABELS,
  TRANSACTION_SOURCE_LABELS,
} from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import type { LedgerEntry, TransactionKind } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchField,
  Segmented,
  Sheet,
  StatCard,
  buttonStyles,
  cn,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FinanceNav } from "@/components/finance-nav";
import { TransactionSheet } from "@/components/transaction-sheet";
import { CategorySheet } from "@/components/category-sheet";

type KindFilter = "all" | TransactionKind;

const chequeTone = (entry: LedgerEntry) =>
  entry.cheque?.status === "cleared"
    ? ("emerald" as const)
    : entry.cheque?.status === "bounced"
      ? ("rose" as const)
      : ("amber" as const);

export default function LedgerPage() {
  const { data, update, toast, isManager } = useClub();
  const t = useT();
  const [monthOffset, setMonthOffset] = useState(0);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<LedgerEntry | null>(null);
  const [sheetKind, setSheetKind] = useState<TransactionKind>("expense");
  const [detail, setDetail] = useState<LedgerEntry | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LedgerEntry | null>(null);

  const now = new Date();
  const entries = useMemo(() => allLedgerEntries(data), [data]);
  const selectedMonth = useMemo(
    () => addJalaliMonths(new Date(), monthOffset),
    [monthOffset],
  );
  const monthEnd = useMemo(() => endOfJalaliMonth(selectedMonth), [selectedMonth]);

  const monthEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const date = new Date(entry.date);
        return date >= selectedMonth && date < monthEnd;
      }),
    [entries, selectedMonth, monthEnd],
  );

  const totals = ledgerTotals(monthEntries);
  const flow = monthlyFlow(entries, 6, now);
  const flowMax = Math.max(
    ...flow.map((point) => Math.max(point.income, point.expense)),
    1,
  );
  const balances = totalBankBalance(data, entries);
  const pending = pendingCheques(entries);
  const pendingTotal = pending.reduce((sum, row) => sum + row.entry.amount, 0);

  const counts = useMemo(
    () => ({
      all: monthEntries.length,
      income: monthEntries.filter((entry) => entry.kind === "income").length,
      expense: monthEntries.filter((entry) => entry.kind === "expense").length,
    }),
    [monthEntries],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return monthEntries
      .filter((entry) => (kindFilter === "all" ? true : entry.kind === kindFilter))
      .filter((entry) => {
        if (!normalizedQuery) return true;
        const haystack = [
          entry.title,
          entry.party ?? "",
          categoryName(data, entry.categoryId),
          accountName(accountById(data, entry.accountId)),
          TRANSACTION_SOURCE_LABELS[entry.source],
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      });
  }, [monthEntries, kindFilter, query, data]);

  const openNew = (kind: TransactionKind) => {
    setEditEntry(null);
    setSheetKind(kind);
    setTransactionOpen(true);
  };

  useEffect(() => {
    if (!isManager || new URLSearchParams(window.location.search).get("new") !== "expense") return;
    setEditEntry(null);
    setSheetKind("expense");
    setTransactionOpen(true);
    window.history.replaceState({}, "", "/finances/ledger");
  }, [isManager]);

  const deleteEntry = () => {
    if (!deleteTarget) return;
    update((current) => ({
      ...current,
      transactions: current.transactions.filter((entry) => entry.id !== deleteTarget.id),
    }));
    toast(t(M.ledger.deleted), "info");
    setDetail(null);
    setDeleteTarget(null);
  };

  const detailAccount = detail ? accountById(data, detail.accountId) : undefined;
  const detailCheque = detail ? detail.cheque : undefined;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title={t(M.shell.titleLedger)}
        subtitle={t(M.ledger.subtitle)}
        action={
          <Button size="sm" onClick={() => openNew("expense")} className="shrink-0">
            <Plus className="h-4 w-4" />
            {t(M.ledger.recordTx)}
          </Button>
        }
      />

      <FinanceNav />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-3 sm:px-4">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <BookOpenCheck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[12px] font-bold text-ink">{formatMonthYear(selectedMonth)}</p>
            <p className="text-[9px] text-muted">{t(M.ledger.monthEntries, { count: faNum(monthEntries.length) })}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonthOffset((value) => value - 1)}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-muted transition hover:bg-slate-50 hover:text-ink"
          >
            <ChevronRight className="h-3.5 w-3.5 ltr:rotate-180" />
            {t(M.ledger.prevMonth)}
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset(0)}
            className={cn(
              "h-8 rounded-lg px-2.5 text-[11px] font-medium transition",
              monthOffset === 0
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-ink-soft hover:bg-slate-200",
            )}
          >
            {t(M.ledger.thisMonth)}
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset((value) => Math.min(value + 1, 0))}
            disabled={monthOffset >= 0}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-muted transition hover:bg-slate-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t(M.ledger.nextMonth)}
            <ChevronLeft className="h-3.5 w-3.5 ltr:rotate-180" />
          </button>
        </div>
      </Card>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard
          label={t(M.ledger.monthIncome)}
          value={compactToman(totals.income)}
          hint={toman(totals.income)}
          icon={<ArrowDownLeft className="h-4 w-4" />}
          tone="emerald"
        />
        <StatCard
          label={t(M.ledger.monthExpense)}
          value={compactToman(totals.expense)}
          hint={toman(totals.expense)}
          icon={<ArrowUpRight className="h-4 w-4" />}
          tone="rose"
        />
        <StatCard
          label={t(M.ledger.monthBalance)}
          value={compactToman(totals.net)}
          hint={
            totals.income
              ? t(M.ledger.ofIncome, { rate: percent((totals.net / totals.income) * 100) })
              : t(M.ledger.noIncome)
          }
          icon={<Scale className="h-4 w-4" />}
          tone={totals.net >= 0 ? "brand" : "amber"}
        />
        <StatCard
          label={t(M.ledger.accountsBalance)}
          value={compactToman(balances)}
          hint={t(M.ledger.activeAccounts, { count: faNum(data.accounts.filter((account) => account.active).length) })}
          icon={<Landmark className="h-4 w-4" />}
          tone="violet"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-ink">{t(M.ledger.flowTrend)}</h2>
              <p className="mt-0.5 text-[11px] text-muted">{t(M.finance.lastMonths, { count: faNum(6) })}</p>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-muted">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {TRANSACTION_KIND_LABELS.income}
              </span>
              <span className="flex items-center gap-1 text-muted">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                {TRANSACTION_KIND_LABELS.expense}
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-end gap-2 sm:gap-3">
            {flow.map((point) => (
              <div key={point.start.toISOString()} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-28 w-full items-end justify-center gap-0.5 rounded-lg bg-slate-50 p-0.5">
                  <div
                    className={cn(
                      "w-1/2 rounded-t-md transition-all duration-500",
                      point.income ? "bg-emerald-500" : "bg-slate-200",
                    )}
                    style={{
                      height: `${Math.max((point.income / flowMax) * 100, point.income ? 8 : 3)}%`,
                    }}
                    title={`${TRANSACTION_KIND_LABELS.income}: ${toman(point.income)}`}
                  />
                  <div
                    className={cn(
                      "w-1/2 rounded-t-md transition-all duration-500",
                      point.expense ? "bg-rose-400" : "bg-slate-200",
                    )}
                    style={{
                      height: `${Math.max((point.expense / flowMax) * 100, point.expense ? 8 : 3)}%`,
                    }}
                    title={`${TRANSACTION_KIND_LABELS.expense}: ${toman(point.expense)}`}
                  />
                </div>
                <span className="text-[9px] text-muted">{point.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px]">
            <span className="text-muted">{t(M.ledger.tuitionAutoHint)}</span>
            <Link href="/finances" className="font-medium text-brand-600">
              {t(M.ledger.manageTuition)}
            </Link>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h2 className="text-[15px] font-bold text-ink">{t(M.ledger.accountsCard)}</h2>
              <p className="mt-0.5 text-[11px] text-muted">{t(M.ledger.clearedBalance)}</p>
            </div>
            <Link href="/finances/accounts" className="text-[11px] font-medium text-brand-600">
              {t(M.ledger.manageWord)}
            </Link>
          </div>
          <div className="mt-2 divide-y divide-line/70">
            {data.accounts
              .filter((account) => account.active)
              .map((account) => (
                <div key={account.id} className="flex items-center gap-2.5 px-4 py-3">
                  <span
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-xl",
                      account.kind === "cash"
                        ? "bg-amber-50 text-amber-600"
                        : "bg-brand-50 text-brand-600",
                    )}
                  >
                    {account.kind === "cash" ? (
                      <ReceiptText className="h-3.5 w-3.5" />
                    ) : (
                      <Landmark className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-ink">{account.name}</p>
                    <p className="text-[9px] text-muted">{account.bankName ?? ACCOUNT_KIND_LABELS[account.kind]}</p>
                  </div>
                  <p className="text-[11px] font-bold text-ink">
                    {compactToman(accountBalance(data, account.id, entries))}
                  </p>
                </div>
              ))}
          </div>

          <div className="m-3 rounded-xl bg-amber-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-amber-800">{t(M.ledger.pendingCheques)}</p>
              <Badge tone="amber">{faNum(pending.length)}</Badge>
            </div>
            <p className="mt-1.5 text-[13px] font-extrabold text-amber-900">{toman(pendingTotal)}</p>
            <Link
              href="/finances/accounts"
              className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-amber-800"
            >
              {t(M.ledger.viewCheques)}
              <ChevronLeft className="h-3 w-3 ltr:rotate-180" />
            </Link>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="space-y-3 px-3.5 pt-4 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-ink">{t(M.ledger.monthCard, { month: formatMonthYear(selectedMonth) })}</h2>
            <div className="flex items-center gap-2">
              <span className="hidden text-[10px] text-muted sm:inline">{t(M.finance.itemsCount, { count: faNum(filtered.length) })}</span>
              <button
                type="button"
                onClick={() => setCategoriesOpen(true)}
                className="flex h-8 items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-[11px] font-medium text-ink-soft transition hover:bg-slate-200"
              >
                <Tags className="h-3.5 w-3.5" />
                {t(M.ledger.categories)}
              </button>
            </div>
          </div>

          <Segmented<KindFilter>
            value={kindFilter}
            onChange={setKindFilter}
            options={[
              { value: "all", label: t(M.form.all), count: counts.all },
              { value: "income", label: TRANSACTION_KIND_LABELS.income, count: counts.income },
              { value: "expense", label: TRANSACTION_KIND_LABELS.expense, count: counts.expense },
            ]}
          />
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={t(M.ledger.searchPh)}
          />
        </div>

        <div className="mt-3 divide-y divide-line/70">
          {filtered.map((entry) => {
            const income = entry.kind === "income";
            const account = accountById(data, entry.accountId);
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setDetail(entry)}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-start transition hover:bg-slate-50/70 sm:px-5"
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                    income ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600",
                  )}
                >
                  {income ? (
                    <ArrowDownLeft className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-[12px] font-semibold text-ink">{entry.title}</p>
                    <Badge tone={entry.source === "tuition" ? "brand" : entry.source === "manual" ? "slate" : "violet"}>
                      {TRANSACTION_SOURCE_LABELS[entry.source]}
                    </Badge>
                    {entry.cheque ? (
                      <Badge tone={chequeTone(entry)}>{CHEQUE_STATUS_LABELS[entry.cheque.status]}</Badge>
                    ) : null}
                    {entry.credit && entry.settled === false ? (
                      <Badge tone="amber">{t(M.ledger.awaitingCollection)}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted">
                    {categoryName(data, entry.categoryId)}
                    {entry.party ? ` · ${entry.party}` : ""}
                    {" · "}
                    {LEDGER_METHOD_LABELS[entry.method]}
                    {account ? ` · ${account.name}` : ""}
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted">{formatDateFull(entry.date)}</p>
                </div>
                <div className="shrink-0 text-end">
                  <p
                    className={cn(
                      "text-[12px] font-extrabold",
                      income ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {income ? "+" : "−"}
                    {toman(entry.amount)}
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted">
                    {entry.source === "manual" ? t(M.ledger.editable) : t(M.ledger.autoRecorded)}
                  </p>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted/40 ltr:rotate-180" />
              </button>
            );
          })}

          {!filtered.length ? (
            <EmptyState
              icon={<SearchX className="h-5 w-5" />}
              title={t(M.ledger.noneFound)}
              description={query ? t(M.ledger.changeQuery) : t(M.ledger.noneThisMonth)}
              action={
                <Button size="sm" onClick={() => openNew("expense")}>
                  <Plus className="h-3.5 w-3.5" />
                  {t(M.ledger.firstTx)}
                </Button>
              }
              className="m-4 border-0 bg-transparent"
            />
          ) : null}
        </div>
      </Card>

      <TransactionSheet
        open={transactionOpen}
        onClose={() => setTransactionOpen(false)}
        entry={editEntry}
        initialKind={sheetKind}
        initialMethod={editEntry?.method ?? (sheetKind === "income" ? "transfer" : "card")}
      />
      <CategorySheet open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />

      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={t(M.ledger.details)}
        description={detail ? TRANSACTION_KIND_LABELS[detail.kind] : undefined}
        footer={
          detail ? (
            <div className="flex gap-2">
              {detail.source === "manual" ? (
                <>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => {
                      setEditEntry(detail);
                      setDetail(null);
                      setTransactionOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    {t(M.form.edit)}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteTarget(detail)}
                    className="text-rose-600 ring-rose-200 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t(M.ledger.deleteWord)}
                  </Button>
                </>
              ) : (
                <Link
                  href={detail.source === "tuition" ? "/finances" : "/finances/shop"}
                  className={buttonStyles("outline", "md", "flex-1")}
                >
                  {detail.source === "tuition" ? t(M.ledger.manageTuition) : t(M.ledger.manageInShop)}
                </Link>
              )}
              <Button type="button" variant="outline" onClick={() => setDetail(null)} className="w-24">
                {t(M.ui.close)}
              </Button>
            </div>
          ) : undefined
        }
      >
        {detail ? (
          <div className="space-y-4">
            <div
              className={cn(
                "rounded-2xl p-4 text-center",
                detail.kind === "income" ? "bg-emerald-50" : "bg-rose-50",
              )}
            >
              <p className="text-[10px] text-muted">{TRANSACTION_KIND_LABELS[detail.kind]}</p>
              <p
                className={cn(
                  "mt-1 text-2xl font-extrabold",
                  detail.kind === "income" ? "text-emerald-700" : "text-rose-700",
                )}
              >
                {toman(detail.amount)}
              </p>
              <div className="mt-2 flex items-center justify-center gap-1.5">
                <Badge tone="slate">{TRANSACTION_SOURCE_LABELS[detail.source]}</Badge>
                <Badge tone="slate">{LEDGER_METHOD_LABELS[detail.method]}</Badge>
                {detail.cheque ? (
                  <Badge tone={chequeTone(detail)}>
                    {t(M.ledger.chequeWord)} {CHEQUE_STATUS_LABELS[detail.cheque.status]}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-line/80 px-4 py-2">
              <DetailRow label={t(M.ledger.descTitle)} value={detail.title} />
              <DetailRow label={t(M.ledger.descCategory)} value={categoryName(data, detail.categoryId)} />
              {detail.method === "credit" && !detail.settled ? (
                <DetailRow label={t(M.ledger.descAccount)} value={t(M.ledger.creditPending)} />
              ) : (
                <DetailRow label={t(M.ledger.descAccount)} value={accountName(detailAccount)} />
              )}
              <DetailRow label={t(M.ledger.descDate)} value={formatDateFull(detail.date)} />
              {detail.settledAt ? (
                <DetailRow label={t(M.ledger.settledDate)} value={formatDateFull(detail.settledAt)} />
              ) : null}
              {detail.party ? <DetailRow label={t(M.ledger.party)} value={detail.party} /> : null}
              {detail.cheque ? (
                <>
                  <DetailRow label={t(M.ledger.chequeNumber)} value={detail.cheque.number} mono />
                  <DetailRow label={t(M.ledger.bank)} value={detail.cheque.bank} />
                  <DetailRow label={t(M.ledger.dueWord)} value={formatDateFull(detail.cheque.dueAt)} />
                </>
              ) : null}
              {detail.note ? <DetailRow label={t(M.ledger.note)} value={detail.note} /> : null}
            </div>

            {detail.source !== "manual" ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-5 text-muted">
                {detail.source === "tuition"
                  ? t(M.ledger.tuitionAutoNote)
                  : t(M.ledger.shopAutoNote)}
              </p>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteEntry}
        title={t(M.ledger.deleteTitle)}
        description={
          deleteTarget
            ? t(M.ledger.deleteDesc, { title: deleteTarget.title, amount: toman(deleteTarget.amount) })
            : ""
        }
        confirmLabel={t(M.ledger.deleteTitle)}
        danger
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 py-2.5 text-[11px] last:border-0">
      <span className="shrink-0 text-muted">{label}</span>
      <span
        className={cn("text-end font-medium text-ink", mono && "font-mono")}
        dir={mono ? "ltr" : undefined}
      >
        {value}
      </span>
    </div>
  );
}
