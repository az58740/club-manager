"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  HandCoins,
  Landmark,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  Undo2,
  Wallet,
} from "lucide-react";
import { useClub } from "@/lib/store";
import {
  accountBalance,
  accountById,
  accountInClearing,
  accountName,
  allLedgerEntries,
  categoryName,
  chequeRows,
  creditRows,
  pendingCheques,
  totalBankBalance,
} from "@/lib/finance";
import { formatDateFull } from "@/lib/date";
import { compactToman, faNum, toman } from "@/lib/format";
import {
  ACCOUNT_KIND_LABELS,
  CHEQUE_STATUS_LABELS,
  LEDGER_METHOD_LABELS,
} from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import type { BankAccount, ChequeStatus, LedgerEntry } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  StatCard,
  cn,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FinanceNav } from "@/components/finance-nav";
import { AccountForm } from "@/components/account-form";
import { CollectSheet } from "@/components/collect-sheet";

type ChequeFilter = "all" | ChequeStatus;

const statusTone = (status?: ChequeStatus) =>
  status === "cleared" ? ("emerald" as const) : status === "bounced" ? ("rose" as const) : ("amber" as const);

export default function AccountsPage() {
  const { data, update, toast } = useClub();
  const t = useT();
  const [formOpen, setFormOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<BankAccount | null>(null);
  const [chequeFilter, setChequeFilter] = useState<ChequeFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null);
  const [collectTarget, setCollectTarget] = useState<LedgerEntry | null>(null);

  const entries = useMemo(() => allLedgerEntries(data), [data]);
  const cheques = useMemo(() => chequeRows(entries), [entries]);
  const pending = pendingCheques(entries);
  const receivables = useMemo(() => creditRows(data, entries), [data, entries]);
  const receivablesTotal = receivables.reduce((sum, row) => sum + row.entry.amount, 0);

  const activeRows = data.accounts.filter((account) => account.active);
  const total = totalBankBalance(data, entries);
  const cashTotal = activeRows
    .filter((account) => account.kind === "cash")
    .reduce((sum, account) => sum + accountBalance(data, account.id, entries), 0);
  const bankTotal = activeRows
    .filter((account) => account.kind === "bank")
    .reduce((sum, account) => sum + accountBalance(data, account.id, entries), 0);
  const pendingTotal = pending.reduce((sum, row) => sum + row.entry.amount, 0);

  const counts = {
    all: cheques.length,
    pending: cheques.filter((row) => row.entry.cheque?.status === "pending").length,
    cleared: cheques.filter((row) => row.entry.cheque?.status === "cleared").length,
    bounced: cheques.filter((row) => row.entry.cheque?.status === "bounced").length,
  };

  const filteredCheques = cheques.filter((row) =>
    chequeFilter === "all" ? true : row.entry.cheque?.status === chequeFilter,
  );

  const usageCount = (accountId: string) =>
    entries.filter((entry) => entry.accountId === accountId).length;

  const openNew = () => {
    setEditAccount(null);
    setFormOpen(true);
  };

  const changeChequeStatus = (entryId: string, status: ChequeStatus) => {
    update((current) => ({
      ...current,
      transactions: current.transactions.map((entry) => {
        if (entry.id !== entryId || !entry.cheque) return entry;
        const settled = entry.credit
          ? status === "bounced"
            ? false
            : status === "cleared"
              ? true
              : entry.settled
          : entry.settled;
        return { ...entry, cheque: { ...entry.cheque, status }, settled };
      }),
      stockMovements: current.stockMovements.map((movement) =>
        movement.ledgerId === entryId && movement.cheque
          ? { ...movement, cheque: { ...movement.cheque, status } }
          : movement,
      ),
    }));
    toast(
      status === "cleared"
        ? t(M.accounts.chequeClearedToast)
        : status === "bounced"
          ? t(M.accounts.chequeBouncedToast)
          : t(M.accounts.chequePendingToast),
      status === "bounced" ? "error" : "success",
    );
  };

  const deleteAccount = () => {
    if (!deleteTarget) return;
    update((current) => ({
      ...current,
      accounts: current.accounts.filter((account) => account.id !== deleteTarget.id),
    }));
    toast(t(M.accounts.deletedToast), "info");
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title={t(M.shell.titleAccounts)}
        subtitle={t(M.accounts.subtitle)}
        action={
          <Button size="sm" onClick={openNew} className="shrink-0">
            <Plus className="h-4 w-4" />
            {t(M.accounts.newAccount)}
          </Button>
        }
      />

      <FinanceNav />

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
        <StatCard
          label={t(M.accounts.totalBalance)}
          value={compactToman(total)}
          hint={toman(total)}
          icon={<Wallet className="h-4 w-4" />}
          tone="brand"
        />
        <StatCard
          label={t(M.accounts.bankAccounts)}
          value={compactToman(bankTotal)}
          hint={t(M.ledger.activeAccounts, { count: faNum(activeRows.filter((account) => account.kind === "bank").length) })}
          icon={<Landmark className="h-4 w-4" />}
          tone="violet"
        />
        <StatCard
          label={ACCOUNT_KIND_LABELS.cash}
          value={compactToman(cashTotal)}
          hint={t(M.accounts.cashBoxCount, { count: faNum(activeRows.filter((account) => account.kind === "cash").length) })}
          icon={<ReceiptText className="h-4 w-4" />}
          tone="amber"
        />
        <StatCard
          label={t(M.accounts.chequesInProgress)}
          value={faNum(pending.length)}
          hint={toman(pendingTotal)}
          icon={<CalendarClock className="h-4 w-4" />}
          tone={pending.length ? "rose" : "emerald"}
        />
        <StatCard
          label={t(M.accounts.receivablesCard)}
          value={compactToman(receivablesTotal)}
          hint={t(M.accounts.openInvoicesCount, { count: faNum(receivables.length) })}
          icon={<HandCoins className="h-4 w-4" />}
          tone={receivables.length ? "amber" : "emerald"}
        />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:gap-5">
        {data.accounts.map((account) => {
          const balance = accountBalance(data, account.id, entries);
          const clearing = accountInClearing(data, account.id, entries);
          const used = usageCount(account.id);
          const isCash = account.kind === "cash";
          return (
            <Card key={account.id} className={cn("overflow-hidden p-5", !account.active && "opacity-70")}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid h-10 w-10 place-items-center rounded-xl",
                      isCash ? "bg-amber-50 text-amber-600" : "bg-brand-50 text-brand-600",
                    )}
                  >
                    {isCash ? <Wallet className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                      {account.name}
                      {!account.active ? <Badge tone="slate">{t(M.accounts.inactiveBadge)}</Badge> : null}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {account.bankName ?? ACCOUNT_KIND_LABELS[account.kind]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditAccount(account);
                      setFormOpen(true);
                    }}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-slate-100 hover:text-ink"
                    aria-label={t(M.accounts.editAccount)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(account)}
                    disabled={used > 0}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={t(M.accounts.deleteAccount)}
                    title={used > 0 ? t(M.accounts.accountHasTxHint) : t(M.accounts.deleteAccount)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[10px] text-muted">{t(M.accounts.balanceLabel)}</p>
                <p className="mt-0.5 text-lg font-extrabold text-ink">{toman(balance)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted">
                  <span>{t(M.accounts.openingBalance, { amount: compactToman(account.openingBalance) })}</span>
                  <span>{t(M.catForm.transactionsCount, { count: faNum(used) })}</span>
                  {clearing !== 0 ? (
                    <span className="text-amber-700">{t(M.accounts.inClearing, { amount: compactToman(Math.abs(clearing)) })}</span>
                  ) : null}
                </div>
              </div>

              {account.kind === "bank" ? (
                <div className="mt-3 space-y-1 text-[10px] text-muted" dir="ltr">
                  {account.accountNumber ? <p className="text-right ltr:text-left font-mono">{t(M.accounts.accountNoLabel)}: {account.accountNumber}</p> : null}
                  {account.cardNumber ? <p className="text-right ltr:text-left font-mono">{t(M.accounts.cardNoLabel)}: {account.cardNumber}</p> : null}
                  {account.iban ? <p className="text-right ltr:text-left font-mono">{t(M.accounts.ibanLabel)}: {account.iban}</p> : null}
                </div>
              ) : null}

              <Link
                href="/finances/ledger"
                className="mt-3 inline-flex items-center gap-1 text-[10px] font-medium text-brand-600 hover:text-brand-700"
              >
                {t(M.accounts.viewTransactions)}
                <ChevronLeft className="h-3 w-3 ltr:rotate-180" />
              </Link>
            </Card>
          );
        })}

        {!data.accounts.length ? (
          <Card className="p-5 sm:col-span-2">
            <EmptyState
              icon={<Landmark className="h-5 w-5" />}
              title={t(M.accounts.noAccountsTitle)}
              description={t(M.accounts.noAccountsDesc)}
              action={
                <Button size="sm" onClick={openNew}>
                  <Plus className="h-3.5 w-3.5" />
                  {t(M.accounts.newAccount)}
                </Button>
              }
              className="border-0 bg-transparent"
            />
          </Card>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pt-4 sm:px-5">
          <div>
            <h2 className="text-[15px] font-bold text-ink">{t(M.accounts.receivablesTitle)}</h2>
            <p className="mt-0.5 text-[11px] text-muted">{t(M.accounts.receivablesSubtitle)}</p>
          </div>
          <Badge tone={receivables.length ? "amber" : "slate"} dot>
            {t(M.accounts.openInvoicesCount, { count: faNum(receivables.length) })} · {toman(receivablesTotal)}
          </Badge>
        </div>

        <div className="mt-3 divide-y divide-line/70">
          {receivables.map((row) => {
            const productName = row.movement
              ? data.products.find((product) => product.id === row.movement?.productId)?.name
              : undefined;
            return (
              <div key={row.entry.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3.5 sm:px-5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
                  <HandCoins className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[12px] font-semibold text-ink">{row.entry.title}</p>
                    <Badge tone="amber">{LEDGER_METHOD_LABELS.credit}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted">
                    {row.entry.party ?? t(M.accounts.noParty)}
                    {productName ? ` · ${productName}` : ""}
                    {" · "}
                    {categoryName(data, row.entry.categoryId)}
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted">
                    {t(M.accounts.soldOn, { date: formatDateFull(row.entry.date) })}
                  </p>
                </div>

                <div className="shrink-0 text-end">
                  <p className="text-[12px] font-extrabold text-amber-700">
                    {toman(row.entry.amount)}
                  </p>
                </div>

                <Button
                  size="sm"
                  className="h-8 w-full px-3 text-[11px] sm:w-auto"
                  onClick={() => setCollectTarget(row.entry)}
                >
                  {t(M.accounts.collectWord)}
                </Button>
              </div>
            );
          })}

          {!receivables.length ? (
            <EmptyState
              icon={<HandCoins className="h-5 w-5" />}
              title={t(M.accounts.noReceivablesTitle)}
              description={t(M.accounts.noReceivablesDesc)}
              className="m-4 border-0 bg-transparent"
            />
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="space-y-3 px-3.5 pt-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-bold text-ink">{t(M.accounts.chequesTitle)}</h2>
              <p className="mt-0.5 text-[11px] text-muted">{t(M.accounts.chequesSubtitle)}</p>
            </div>
            <Badge tone={pending.length ? "amber" : "slate"} dot>
              {t(M.accounts.chequesInCount, { count: faNum(pending.length) })}
            </Badge>
          </div>

          <Segmented<ChequeFilter>
            value={chequeFilter}
            onChange={setChequeFilter}
            options={[
              { value: "all", label: t(M.form.all), count: counts.all },
              { value: "pending", label: CHEQUE_STATUS_LABELS.pending, count: counts.pending },
              { value: "cleared", label: CHEQUE_STATUS_LABELS.cleared, count: counts.cleared },
              { value: "bounced", label: CHEQUE_STATUS_LABELS.bounced, count: counts.bounced },
            ]}
          />
        </div>

        <div className="mt-3 divide-y divide-line/70">
          {filteredCheques.map((row) => {
            const { entry, direction, dueAt } = row;
            const status = entry.cheque?.status ?? "pending";
            const account = accountById(data, entry.accountId);
            const overdue = status === "pending" && new Date(dueAt).getTime() < Date.now();
            const received = direction === "received";
            return (
              <div key={entry.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3.5 sm:px-5">
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                    received ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600",
                  )}
                >
                  {received ? (
                    <ArrowDownLeft className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[12px] font-semibold text-ink">
                      {t(M.ledger.chequeWord)} {entry.cheque?.number}
                    </p>
                    <Badge tone={statusTone(status)}>{CHEQUE_STATUS_LABELS[status]}</Badge>
                    {overdue ? <Badge tone="rose">{t(M.accounts.overdueBadge)}</Badge> : null}
                    <Badge tone="slate">{received ? t(M.accounts.receivedWord) : t(M.accounts.issuedWord)}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted">
                    {entry.cheque?.bank} · {entry.title}
                    {entry.party ? ` · ${entry.party}` : ""}
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted">
                    {t(M.ledger.dueWord)} {formatDateFull(dueAt)} · {accountName(account)} ·{" "}
                    {LEDGER_METHOD_LABELS[entry.method]}
                  </p>
                </div>

                <div className="shrink-0 text-end">
                  <p
                    className={cn(
                      "text-[12px] font-extrabold",
                      received ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {received ? "+" : "−"}
                    {toman(entry.amount)}
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted">
                    {categoryName(data, entry.categoryId)}
                  </p>
                </div>

                <div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto">
                  {status === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 px-2.5 text-[11px] text-emerald-700 ring-emerald-200 hover:bg-emerald-50 sm:flex-none"
                        onClick={() => changeChequeStatus(entry.id, "cleared")}
                      >
                        {t(M.accounts.clearedBtn)}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 px-2.5 text-[11px] text-rose-600 ring-rose-200 hover:bg-rose-50 sm:flex-none"
                        onClick={() => changeChequeStatus(entry.id, "bounced")}
                      >
                        {t(M.accounts.bouncedBtn)}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 px-2.5 text-[11px] text-muted sm:flex-none"
                      onClick={() => changeChequeStatus(entry.id, "pending")}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      {t(M.accounts.backToPending)}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {!filteredCheques.length ? (
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title={t(M.accounts.noChequesTitle)}
              description={
                chequeFilter === "all" ? t(M.accounts.noChequesAll) : t(M.accounts.noChequesFiltered)
              }
              className="m-4 border-0 bg-transparent"
            />
          ) : null}
        </div>
      </Card>

      <AccountForm open={formOpen} onClose={() => setFormOpen(false)} account={editAccount} />

      <CollectSheet
        open={Boolean(collectTarget)}
        onClose={() => setCollectTarget(null)}
        entry={collectTarget}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteAccount}
        title={t(M.accounts.deleteAccount)}
        description={deleteTarget ? t(M.accounts.deleteDesc, { name: deleteTarget.name }) : ""}
        confirmLabel={t(M.accounts.deleteAccount)}
        danger
      />
    </div>
  );
}
