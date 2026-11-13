"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  Plus,
  ReceiptText,
  SearchX,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useClub } from "@/lib/store";
import { normalizeInvoicePeriod } from "@/lib/finance";
import {
  invoicePaidAmount,
  invoiceRemaining,
  invoiceState,
  isInvoiceOverdue,
  lastSixMonthRevenue,
  playerById,
  playerTotalDebt,
  debtorBreakdown,
} from "@/lib/selectors";
import { formatDateFull, formatMonthYear, toDateInput } from "@/lib/date";
import { compactToman, faNum, percent, toman, uid } from "@/lib/format";
import { INVOICE_KIND_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { M, useT, type Message } from "@/lib/i18n/messages";
import type { Invoice, InvoiceKind } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  JalaliDateInput,
  PageHeader,
  Progress,
  SearchField,
  Segmented,
  Select,
  Sheet,
  StatCard,
  cn,
} from "@/components/ui";
import { PaymentSheet } from "@/components/payment-sheet";
import { FinanceNav } from "@/components/finance-nav";

type StatusFilter = "all" | "open" | "paid";

const statusBadge = (
  invoice: Invoice,
  data: Parameters<typeof invoiceState>[1],
  t: (message: Message) => string,
) => {
  const state = invoiceState(invoice, data);
  if (state === "paid") return { tone: "emerald" as const, label: t(M.finance.badgeSettled) };
  if (state === "partial") return { tone: "amber" as const, label: t(M.finance.badgePartial) };
  return { tone: "rose" as const, label: t(M.finance.badgeUnpaid) };
};

export default function FinancesPage() {
  const { data, currentUser, isManager, isPlayer, update, toast } = useClub();
  const t = useT();
  const now = new Date();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issuePeriod, setIssuePeriod] = useState(formatMonthYear(now));
  const [issueKind, setIssueKind] = useState<InvoiceKind>("tuition");
  const [issueTeam, setIssueTeam] = useState("all");
  const [issueDue, setIssueDue] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 9);
    return toDateInput(date);
  });
  const [issueAmount, setIssueAmount] = useState("");

  const myPlayerId = isPlayer ? currentUser?.playerId : undefined;
  const myPlayer = myPlayerId ? playerById(data, myPlayerId) : undefined;
  const currentPeriod = formatMonthYear(now);
  const canPay = isManager;

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1" && isManager) {
      setIssueOpen(true);
      window.history.replaceState({}, "", "/finances");
    }
  }, [isManager]);

  useEffect(() => {
    if (!issueOpen) return;
    setIssuePeriod(formatMonthYear(new Date()));
    setIssueKind("tuition");
    setIssueTeam("all");
    setIssueAmount("");
    const date = new Date();
    date.setDate(date.getDate() + 9);
    setIssueDue(toDateInput(date));
  }, [issueOpen]);

  const scopeInvoices = useMemo(
    () =>
      isPlayer
        ? data.invoices.filter((invoice) => invoice.playerId === myPlayerId)
        : data.invoices,
    [data.invoices, isPlayer, myPlayerId],
  );

  const periodInvoices = scopeInvoices.filter(
    (invoice) => normalizeInvoicePeriod(invoice.period) === normalizeInvoicePeriod(currentPeriod),
  );
  const periodTotal = periodInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const periodPaid = periodInvoices.reduce(
    (sum, invoice) => sum + invoicePaidAmount(invoice, data),
    0,
  );
  const collectRate = periodTotal ? (periodPaid / periodTotal) * 100 : 0;
  const debtRows = useMemo(() => debtorBreakdown(data), [data]);

  const debtTotals = useMemo(
    () =>
      debtRows.reduce(
        (sum, row) => ({
          tuition: sum.tuition + row.tuition,
          shop: sum.shop + row.shop,
          total: sum.total + row.total,
        }),
        { tuition: 0, shop: 0, total: 0 },
      ),
    [debtRows],
  );

  const outstanding = isPlayer
    ? myPlayer
      ? playerTotalDebt(myPlayer.id, data)
      : 0
    : debtRows.reduce((sum, row) => sum + row.total, 0);

  const last30Revenue = data.payments
    .filter(
      (payment) =>
        (!isPlayer || payment.playerId === myPlayerId) &&
        +new Date(payment.paidAt) >= now.getTime() - 30 * 864e5,
    )
    .reduce((sum, payment) => sum + payment.amount, 0);

  const allTimePaid = data.payments
    .filter((payment) => !isPlayer || payment.playerId === myPlayerId)
    .reduce((sum, payment) => sum + payment.amount, 0);

  const debtorRows = useMemo(() => {
    if (!isManager) return [];
    return debtRows.slice(0, 4);
  }, [debtRows, isManager]);

  const recentPayments = useMemo(() => {
    return [...data.payments]
      .filter((payment) => !isPlayer || payment.playerId === myPlayerId)
      .sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt))
      .slice(0, 4);
  }, [data.payments, isPlayer, myPlayerId]);

  const chart = lastSixMonthRevenue(data, now, isPlayer ? (myPlayerId ?? "__none__") : undefined);
  const chartMax = Math.max(...chart.map((month) => month.amount), 1);
  const chartTotal = chart.reduce((sum, month) => sum + month.amount, 0);

  const filteredInvoices = useMemo(() => {
    return scopeInvoices
      .filter((invoice) => {
        const state = invoiceState(invoice, data);
        if (statusFilter === "open") return state !== "paid";
        if (statusFilter === "paid") return state === "paid";
        return true;
      })
      .filter((invoice) => {
        if (!query.trim()) return true;
        const player = playerById(data, invoice.playerId);
        return (
          (player?.fullName.includes(query.trim()) ?? false) ||
          invoice.title.includes(query.trim())
        );
      })
      .sort((a, b) => +new Date(b.dueAt) - +new Date(a.dueAt));
  }, [scopeInvoices, data, statusFilter, query]);

  const counts = useMemo(() => {
    let open = 0;
    let paid = 0;
    for (const invoice of scopeInvoices) {
      if (invoiceState(invoice, data) === "paid") paid += 1;
      else open += 1;
    }
    return { open, paid, all: scopeInvoices.length };
  }, [scopeInvoices, data]);

  const issueEligible = useMemo(() => {
    if (!issueOpen) return [];
    const override = Number(issueAmount) || 0;
    return data.players
      .filter((player) => player.status !== "inactive")
      .filter((player) => issueTeam === "all" || player.teamId === issueTeam)
      .filter(
        (player) =>
          !data.invoices.some(
            (invoice) =>
              invoice.playerId === player.id &&
              invoice.kind === issueKind &&
              normalizeInvoicePeriod(invoice.period) === normalizeInvoicePeriod(issuePeriod.trim()),
          ),
      )
      .map((player) => ({
        player,
        amount: issueKind === "tax" ? override : override > 0 ? override : player.monthlyFee,
      }))
      .filter((row) => row.amount > 0);
  }, [data.players, data.invoices, issueOpen, issueTeam, issuePeriod, issueKind, issueAmount]);

  const issueTotal = issueEligible.reduce((sum, row) => sum + row.amount, 0);

  const issueInvoices = () => {
    if (!issuePeriod.trim()) {
      toast(t(M.finance.errPeriod), "error");
      return;
    }
    if (!issueEligible.length) {
      toast(t(M.finance.errNoEligible), "error");
      return;
    }
    const issuedAt = new Date().toISOString();
    const dueAt = new Date(`${issueDue}T12:00:00`).toISOString();
    const rows: Invoice[] = issueEligible.map(({ player, amount }) => ({
      id: uid("inv"),
      playerId: player.id,
      kind: issueKind,
      period: issuePeriod.trim(),
      title: `${INVOICE_KIND_LABELS[issueKind]} ${issuePeriod.trim()}`,
      amount,
      dueAt,
      issuedAt,
    }));
    update((current) => ({ ...current, invoices: [...current.invoices, ...rows] }));
    toast(
      t(M.finance.issuedToast, {
        count: faNum(rows.length),
        kind: INVOICE_KIND_LABELS[issueKind],
      }),
    );
    setIssueOpen(false);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title={isPlayer ? t(M.finance.titleMine) : t(M.shell.titleFinances)}
        subtitle={
          isPlayer
            ? t(M.finance.mineSubtitle, {
                count: faNum(counts.all),
                amount: toman(outstanding),
              })
            : t(M.finance.clubSubtitle)
        }
        action={
          isManager ? (
            <Button size="sm" onClick={() => setIssueOpen(true)} className="shrink-0">
              <Plus className="h-4 w-4" />
              {t(M.finance.issueBtn)}
            </Button>
          ) : undefined
        }
      />

      {isManager ? <FinanceNav /> : null}

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {isPlayer ? (
          <>
            <StatCard
              label={t(M.finance.balanceDue)}
              value={toman(outstanding)}
              hint={outstanding ? t(M.finance.needsPayment) : t(M.players.invoicePaid)}
              icon={<AlertCircle className="h-4 w-4" />}
              tone={outstanding ? "rose" : "emerald"}
            />
            <StatCard
              label={t(M.finance.totalPaid)}
              value={compactToman(allTimePaid)}
              hint={t(M.finance.sinceJoined)}
              icon={<Wallet className="h-4 w-4" />}
              tone="emerald"
            />
            <StatCard
              label={t(M.finance.paidDays, { count: faNum(30) })}
              value={compactToman(last30Revenue)}
              hint={t(M.finance.recentPeriod)}
              icon={<TrendingUp className="h-4 w-4" />}
              tone="violet"
            />
            <StatCard
              label={t(M.finance.collectionRate)}
              value={percent(collectRate)}
              hint={t(M.finance.periodName, { period: currentPeriod })}
              icon={<ReceiptText className="h-4 w-4" />}
              tone="brand"
            />
          </>
        ) : (
          <>
            <StatCard
              label={t(M.finance.revenueDays, { count: faNum(30) })}
              value={compactToman(last30Revenue)}
              hint={toman(last30Revenue)}
              icon={<TrendingUp className="h-4 w-4" />}
              tone="violet"
            />
            <StatCard
              label={t(M.finance.receivables)}
              value={compactToman(outstanding)}
              hint={t(M.finance.debtorsHint, { count: faNum(debtRows.length) })}
              icon={<AlertCircle className="h-4 w-4" />}
              tone={outstanding ? "amber" : "emerald"}
            />
            <StatCard
              label={t(M.finance.periodCollected)}
              value={percent(collectRate)}
              hint={t(M.finance.ofTotal, {
                paid: compactToman(periodPaid),
                total: compactToman(periodTotal),
              })}
              icon={<Wallet className="h-4 w-4" />}
              tone="emerald"
            />
            <StatCard
              label={t(M.finance.invoicesWord)}
              value={faNum(counts.all)}
              hint={t(M.finance.openInvoicesHint, { count: faNum(counts.open) })}
              icon={<ReceiptText className="h-4 w-4" />}
              tone="brand"
            />
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-ink">{t(M.finance.revenueTrend)}</h2>
              <p className="mt-0.5 text-[11px] text-muted">{t(M.finance.lastMonths, { count: faNum(6) })}</p>
            </div>
            <div className="text-end">
              <p className="text-base font-extrabold text-ink">{compactToman(chartTotal)}</p>
              <p className="text-[9px] text-muted">{t(M.common.tomanUnit)}</p>
            </div>
          </div>

          <div className="mt-5 flex items-end gap-2 sm:gap-3">
            {chart.map((month) => (
              <div
                key={month.start.toISOString()}
                className="flex flex-1 flex-col items-center gap-1.5"
                title={toman(month.amount)}
              >
                <div className="flex h-28 w-full items-end rounded-lg bg-slate-50 p-0.5">
                  <div
                    className={cn(
                      "w-full rounded-md transition-all duration-500",
                      month.amount
                        ? "bg-gradient-to-t from-brand-600 to-brand-400"
                        : "bg-slate-200",
                    )}
                    style={{
                      height: `${Math.max((month.amount / chartMax) * 100, month.amount ? 8 : 3)}%`,
                    }}
                  />
                </div>
                <span className="text-[9px] text-muted">{month.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-[11px]">
            <span className="text-muted">
              {t(M.finance.collectRateForPeriod, { period: currentPeriod })}
            </span>
            <span className="font-bold text-ink">{percent(collectRate)}</span>
          </div>
          <Progress value={collectRate} className="mt-2" tone="bg-emerald-500" />
        </Card>

        {isManager ? (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5">
              <div>
                <h2 className="text-[15px] font-bold text-ink">{t(M.finance.topDebts)}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{t(M.finance.tuitionPlusShop)}</p>
              </div>
              <Link href="/players" className="text-[11px] font-medium text-brand-600">
                {t(M.shell.navPlayers)}
              </Link>
            </div>
            <div className="mt-2 divide-y divide-line/70">
              {debtorRows.map(({ player, total, tuition, shop }) => (
                <Link
                  key={player.id}
                  href={`/players?id=${player.id}`}
                  className="flex items-center gap-2.5 px-4 py-3 transition hover:bg-slate-50/70"
                >
                  <Avatar name={player.fullName} size="sm" ring={false} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-ink">{player.fullName}</p>
                    <p className="text-[10px] text-muted">
                      {data.teams.find((team) => team.id === player.teamId)?.name}
                      {shop > 0 ? ` · ${t(M.finance.shopWord)} ${compactToman(shop)}` : ""}
                      {tuition > 0 ? ` · ${t(M.finance.tuitionWord)} ${compactToman(tuition)}` : ""}
                    </p>
                  </div>
                  <p className="text-[11px] font-bold text-rose-600">{toman(total)}</p>
                </Link>
              ))}
              {!debtorRows.length ? (
                <p className="px-4 py-8 text-center text-[11px] text-muted">
                  {t(M.finance.allSettledDebts)}
                </p>
              ) : null}
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5">
              <div>
                <h2 className="text-[15px] font-bold text-ink">{t(M.finance.myPayments)}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{t(M.finance.myPaymentsSub)}</p>
              </div>
              <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">
                {myPlayer ? data.teams.find((team) => team.id === myPlayer.teamId)?.name : ""}
              </span>
            </div>
            <div className="mt-2 divide-y divide-line/70">
              {recentPayments.map((payment) => (
                <div key={payment.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                    <ReceiptText className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-ink">
                      {PAYMENT_METHOD_LABELS[payment.method]}
                    </p>
                    <p className="text-[10px] text-muted">{formatDateFull(payment.paidAt)}</p>
                  </div>
                  <p className="text-[11px] font-bold text-ink">{toman(payment.amount)}</p>
                </div>
              ))}
              {!recentPayments.length ? (
                <p className="px-4 py-8 text-center text-[11px] text-muted">
                  {t(M.finance.noPayments)}
                </p>
              ) : null}
            </div>
          </Card>
        )}
      </div>

      {isManager ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 pt-4 sm:px-5">
            <div>
              <h2 className="text-[15px] font-bold text-ink">{t(M.finance.debtsCard)}</h2>
              <p className="mt-0.5 text-[11px] text-muted">
                {t(M.finance.debtsSub)}
              </p>
            </div>
            <Badge tone={debtRows.length ? "rose" : "emerald"}>
              {t(M.finance.debtorsHint, { count: faNum(debtRows.length) })}
            </Badge>
          </div>

          {debtRows.length ? (
            <div className="mt-2 divide-y divide-line/70">
              {debtRows.map(({ player, tuition, shop, total }) => (
                <Link
                  key={player.id}
                  href={`/players?id=${player.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5"
                >
                  <Avatar name={player.fullName} size="sm" ring={false} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-ink">{player.fullName}</p>
                    <p className="text-[10px] text-muted">
                      {data.teams.find((team) => team.id === player.teamId)?.name ?? t(M.finance.noTeam)}
                    </p>
                  </div>
                  <div className="hidden shrink-0 items-center gap-4 text-[10px] text-muted sm:flex">
                    <span>
                      {t(M.finance.tuitionWord)}{" "}
                      <b className="font-bold text-ink-soft">{tuition ? compactToman(tuition) : "—"}</b>
                    </span>
                    <span>
                      {t(M.finance.shopWord)}{" "}
                      <b className="font-bold text-ink-soft">{shop ? compactToman(shop) : "—"}</b>
                    </span>
                  </div>
                  <p className="w-24 shrink-0 text-end text-[11px] font-extrabold text-rose-600">
                    {toman(total)}
                  </p>
                </Link>
              ))}
              <div className="flex items-center justify-between bg-slate-50/80 px-4 py-3 text-[11px] sm:px-5">
                <span className="font-medium text-ink">
                  {t(M.finance.debtsTotal, {
                    tuition: compactToman(debtTotals.tuition),
                    shop: compactToman(debtTotals.shop),
                  })}
                </span>
                <span className="font-extrabold text-rose-700">{toman(debtTotals.total)}</span>
              </div>
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-[11px] text-muted">
              {t(M.finance.allClearDebts)}
            </p>
          )}
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="space-y-3 px-3.5 pt-4 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-ink">{t(M.finance.invoicesWord)}</h2>
            <span className="text-[10px] text-muted">{t(M.finance.itemsCount, { count: faNum(filteredInvoices.length) })}</span>
          </div>
          <Segmented<StatusFilter>
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: t(M.form.all), count: counts.all },
              { value: "open", label: t(M.finance.filterOpen), count: counts.open },
              { value: "paid", label: t(M.finance.filterPaid), count: counts.paid },
            ]}
          />
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={isPlayer ? t(M.finance.phMineInvoices) : t(M.finance.phClubInvoices)}
          />
        </div>

        <div className="mt-3 divide-y divide-line/70">
          {filteredInvoices.map((invoice) => {
            const player = playerById(data, invoice.playerId);
            const badge = statusBadge(invoice, data, t);
            const remaining = invoiceRemaining(invoice, data);
            const paid = invoicePaidAmount(invoice, data);
            const overdue = isInvoiceOverdue(invoice, data, now);
            return (
              <div
                key={invoice.id}
                className="flex items-center gap-3 px-3.5 py-3 transition hover:bg-slate-50/60 sm:px-5"
              >
                {player ? (
                  <Avatar name={player.fullName} size="sm" ring={false} />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-muted">
                    <ReceiptText className="h-4 w-4" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={player ? `/players?id=${player.id}` : "/players"}
                      className="truncate text-[12px] font-semibold text-ink hover:text-brand-600"
                    >
                      {player?.fullName ?? t(M.common.playerWord)}
                    </Link>
                    <Badge tone={badge.tone} className="hidden sm:inline-flex">
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted">
                    <span
                      className={
                        invoice.kind === "tax" ? "font-medium text-amber-600" : "text-muted"
                      }
                    >
                      {INVOICE_KIND_LABELS[invoice.kind]}
                    </span>
                    {" · "}
                    {invoice.period} · {t(M.players.dueWord)}{" "}
                    <span className={overdue ? "font-medium text-rose-600" : ""}>
                      {formatDateFull(invoice.dueAt)}
                    </span>
                  </p>
                </div>

                <div className="shrink-0 text-end">
                  <p className="text-[11px] font-bold text-ink">{toman(invoice.amount)}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-[9px]",
                      remaining > 0 ? "text-rose-600" : "text-emerald-600",
                    )}
                  >
                    {remaining > 0
                      ? t(M.players.remaining, { amount: compactToman(remaining) })
                      : t(M.finance.settledWith, { paid: compactToman(paid) })}
                  </p>
                </div>

                {canPay && remaining > 0 ? (
                  <button
                    type="button"
                    onClick={() => setPaymentInvoiceId(invoice.id)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition hover:bg-brand-100 sm:h-9 sm:w-auto sm:px-3"
                    aria-label={t(M.finance.payAria, { name: player?.fullName ?? t(M.common.playerWord) })}
                  >
                    <ReceiptText className="h-4 w-4" />
                    <span className="hidden text-[11px] font-medium sm:inline">{t(M.finance.payBtn)}</span>
                  </button>
                ) : (
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted/40 ltr:rotate-180" />
                )}
              </div>
            );
          })}
        </div>

        {!filteredInvoices.length ? (
          <EmptyState
            className="m-4 border-0 bg-slate-50/60"
            icon={<SearchX className="h-5 w-5" />}
            title={t(M.finance.noInvoicesFound)}
            description={
              query || statusFilter !== "all"
                ? t(M.finance.filterHint)
                : t(M.finance.startHint)
            }
            action={
              isManager ? (
                <Button size="sm" variant="soft" onClick={() => setIssueOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {t(M.finance.issueBtn)}
                </Button>
              ) : undefined
            }
          />
        ) : null}
      </Card>

      <p className="px-1 text-[10px] leading-5 text-muted">
        {t(M.finance.manualNote)}
      </p>

      <PaymentSheet
        open={paymentInvoiceId !== null}
        onClose={() => setPaymentInvoiceId(null)}
        invoiceId={paymentInvoiceId}
      />

      <Sheet
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title={t(M.finance.issueTitle)}
        description={t(M.finance.issueDesc)}
        footer={
          <div className="flex gap-2">
            <Button type="button" className="flex-1" onClick={issueInvoices} disabled={!issueEligible.length}>
              {t(M.finance.issueCountBtn, { count: faNum(issueEligible.length) })}
            </Button>
            <Button type="button" variant="outline" onClick={() => setIssueOpen(false)} className="w-28">
              {t(M.form.cancel)}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t(M.finance.periodField)} required>
              <Input
                value={issuePeriod}
                onChange={(event) => setIssuePeriod(event.target.value)}
                placeholder={t(M.finance.phPeriod)}
              />
            </Field>
            <Field label={t(M.finance.kindField)}>
              <Select
                value={issueKind}
                onChange={(event) => setIssueKind(event.target.value as InvoiceKind)}
              >
                <option value="tuition">{INVOICE_KIND_LABELS.tuition}</option>
                <option value="tax">{INVOICE_KIND_LABELS.tax}</option>
              </Select>
            </Field>
            <Field label={t(M.login.team)}>
              <Select value={issueTeam} onChange={(event) => setIssueTeam(event.target.value)}>
                <option value="all">{t(M.form.allTeams)}</option>
                {data.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t(M.finance.dueDateField)} required>
              <JalaliDateInput value={issueDue} onChange={setIssueDue} />
            </Field>
            <Field
              label={t(M.finance.fixedAmount)}
              hint={
                issueKind === "tax"
                  ? t(M.finance.fixedAmountTax)
                  : t(M.finance.fixedAmountTuition)
              }
              className="sm:col-span-2"
            >
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={100000}
                value={issueAmount}
                onChange={(event) => setIssueAmount(event.target.value)}
                placeholder={t(M.finance.phAmount)}
                dir="ltr"
                className="text-right ltr:text-left"
              />
            </Field>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted">{t(M.finance.eligibleField)}</span>
              <span className="font-bold text-ink">{t(M.finance.peopleCount, { count: faNum(issueEligible.length) })}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[12px]">
              <span className="text-muted">{t(M.finance.invoicesTotal)}</span>
              <span className="font-bold text-ink">{toman(issueTotal)}</span>
            </div>
            {issueEligible.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {issueEligible.slice(0, 6).map(({ player }) => (
                  <span
                    key={player.id}
                    className="rounded-full bg-white px-2 py-1 text-[10px] text-ink-soft ring-1 ring-line"
                  >
                    {player.fullName}
                  </span>
                ))}
                {issueEligible.length > 6 ? (
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] text-muted ring-1 ring-line">
                    {t(M.finance.morePeople, { count: faNum(issueEligible.length - 6) })}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-[11px] leading-5 text-rose-600">
                {t(M.finance.noEligible)}
              </p>
            )}
          </div>

          <p className="text-[10px] leading-5 text-muted">
            {t(M.finance.issueNote)}
          </p>
        </div>
      </Sheet>
    </div>
  );
}
