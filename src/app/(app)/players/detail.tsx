"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  Pencil,
  Phone,
  ReceiptText,
  Ruler,
  ShieldCheck,
  ShieldOff,
  Trophy,
  UserX,
  Wallet,
} from "lucide-react";
import { useClub } from "@/lib/store";
import {
  invoicePaidAmount,
  invoiceRemaining,
  invoiceState,
  playerAttendance,
  playerShopDebt,
  playerStats,
  playerTotalDebt,
  teamById,
} from "@/lib/selectors";
import {
  ATTENDANCE_LABELS,
  PLAYER_STATUS_LABELS,
  POSITION_LABELS,
  STAT_LABELS,
  TEAM_THEME,
} from "@/lib/labels";
import { ageFromBirthDate, formatDateFull, formatDay, formatTime } from "@/lib/date";
import { faNum, compactToman, percent, toman } from "@/lib/format";
import { M, type Message, useT } from "@/lib/i18n/messages";
import type { Invoice } from "@/lib/types";
import { Avatar, Badge, Button, Card, EmptyState, Progress, Segmented, cn } from "@/components/ui";
import { PlayerFormSheet } from "@/components/player-form";
import { PaymentSheet } from "@/components/payment-sheet";
import { TuitionReceiptSheet } from "@/components/tuition-receipt-sheet";
import { OpeningDebtSheet } from "@/components/opening-debt-sheet";

type Tab = "stats" | "attendance" | "finance";

const attendanceTone = {
  present: "emerald",
  late: "amber",
  absent: "rose",
  excused: "slate",
} as const;

function invoiceBadge(invoice: Invoice, data: Parameters<typeof invoiceState>[1]) {
  const state = invoiceState(invoice, data);
  if (state === "paid") return { tone: "emerald" as const, message: M.players.invoicePaid };
  if (state === "partial") return { tone: "amber" as const, message: M.players.invoicePartial };
  return { tone: "rose" as const, message: M.players.invoiceUnpaid };
}

export default function PlayerProfilePage({ recordId }: { recordId: string }) {
  const router = useRouter();
  const { data, currentUser, isManager, isCoach, isPlayer } = useClub();
  const t = useT();
  const statLabels = STAT_LABELS[data.club.sport];
  const id = recordId;

  const player = data.players.find((row) => row.id === id);
  const team = player ? teamById(data, player.teamId) : undefined;
  const [tab, setTab] = useState<Tab>("stats");
  const [editOpen, setEditOpen] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [tuitionReceiptOpen, setTuitionReceiptOpen] = useState(false);
  const [openingDebtOpen, setOpeningDebtOpen] = useState(false);

  useEffect(() => {
    if (isPlayer && currentUser?.playerId && id && id !== currentUser.playerId) {
      router.replace(`/players?id=${currentUser.playerId}`);
    }
  }, [isPlayer, currentUser?.playerId, id, router]);

  if (!player) {
    return (
      <EmptyState
        className="mt-6"
        icon={<UserX className="h-5 w-5" />}
        title={t(M.players.notFound)}
        description={t(M.players.notFoundDesc)}
        action={
          <Link href="/players">
            <Button variant="soft" size="sm">
              {t(M.players.backToPlayers)}
            </Button>
          </Link>
        }
      />
    );
  }

  const stats = playerStats(data, player.id);
  const attendance = playerAttendance(data, player.id);
  const debt = playerTotalDebt(player.id, data);
  const shopDebt = playerShopDebt(player.id, data);
  const canEdit = isManager || isCoach;
  const canSeeFinance = isManager || isPlayer;
  const canPay = isManager;

  const tabs: Array<{ value: Tab; label: Message }> = [
    { value: "stats", label: M.players.tabStats },
    { value: "attendance", label: M.players.tabAttendance },
    ...(canSeeFinance ? [{ value: "finance" as Tab, label: M.players.tabFinance }] : []),
  ];

  const statRows = data.stats
    .filter((row) => row.playerId === player.id)
    .map((row) => ({ stat: row, event: data.events.find((event) => event.id === row.eventId) }))
    .sort((a, b) => +new Date(b.event?.startsAt ?? 0) - +new Date(a.event?.startsAt ?? 0));

  const attendanceRows = attendance.rows
    .map((row) => ({ record: row, event: data.events.find((event) => event.id === row.eventId) }))
    .sort((a, b) => +new Date(b.event?.startsAt ?? 0) - +new Date(a.event?.startsAt ?? 0));

  const invoices = data.invoices
    .filter((invoice) => invoice.playerId === player.id)
    .sort((a, b) => +new Date(b.dueAt) - +new Date(a.dueAt));
  const openingDebtInvoice = invoices.find((invoice) => invoice.kind === "opening_balance") ?? null;
  const openingDebtPaid = openingDebtInvoice ? invoicePaidAmount(openingDebtInvoice, data) : 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href="/players"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted transition hover:text-ink"
        >
          <ArrowRight className="h-4 w-4 ltr:rotate-180" />
          {t(M.shell.navPlayers)}
        </Link>
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            {t(M.form.edit)}
          </Button>
        ) : null}
      </div>

      <section className="relative overflow-hidden rounded-[28px] bg-white ring-1 ring-line/80">
        <div
          className={cn(
            "relative overflow-hidden bg-gradient-to-br p-5 text-white sm:p-6",
            team ? TEAM_THEME[team.color].gradient : "from-brand-600 to-night-900",
          )}
        >
          <div className="absolute inset-0 court-lines" />
          <div className="absolute inset-0 court-grid opacity-[0.12]" />
          <span className="pointer-events-none absolute -top-6 -end-2 select-none text-[100px] font-black leading-none text-white/10">
            {faNum(player.jersey)}
          </span>

          <div className="relative flex items-start gap-4">
            <Avatar name={player.fullName} size="xl" className="ring-4 ring-white/20" />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                  {player.fullName}
                </h1>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] ring-1 ring-white/20">
                  {PLAYER_STATUS_LABELS[player.status]}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-white/70">
                {POSITION_LABELS[player.position]} · {t(M.players.jerseyNumber, { number: faNum(player.jersey) })}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {team ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] ring-1 ring-white/15">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                    {team.name} · {team.ageGroup}
                  </span>
                ) : null}
                {player.birthDate ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] ring-1 ring-white/15">
                    <CalendarDays className="h-3 w-3" />
                    {t(M.players.ageYears, { age: faNum(ageFromBirthDate(player.birthDate)) })}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] ring-1 ring-white/15">
                  {player.insured ? (
                    <ShieldCheck className="h-3 w-3" />
                  ) : (
                    <ShieldOff className="h-3 w-3" />
                  )}
                  {t(player.insured ? M.players.insured : M.players.notInsured)}
                </span>
              </div>
            </div>
          </div>

          <div className="relative mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/75">
            <a href={`tel:${player.phone}`} className="inline-flex items-center gap-1.5" dir="ltr">
              <Phone className="h-3.5 w-3.5" />
              {player.phone || "—"}
            </a>
            <span className="inline-flex items-center gap-1.5">
              <Ruler className="h-3.5 w-3.5" />
              {player.heightCm
                ? t(M.players.centimetres, { value: faNum(player.heightCm) })
                : t(M.players.noHeight)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {t(M.players.joinedOn, { date: formatDateFull(player.joinedAt) })}
            </span>
          </div>

          {player.address ? (
            <p className="relative mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-white/70">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {player.address}
            </p>
          ) : null}

          {player.note ? (
            <p className="relative mt-4 rounded-xl bg-white/10 px-3 py-2 text-[11px] leading-5 text-white/75 ring-1 ring-white/10">
              {player.note}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-3 divide-x divide-line/70 rtl:divide-x-reverse">
          <div className="px-3 py-3.5 text-center sm:py-4">
            <p className="text-[10px] text-muted">{t(M.players.totalPoints)}</p>
            <p className="mt-1 text-base font-extrabold text-ink sm:text-lg">
              {faNum(stats.points)}
            </p>
          </div>
          <div className="px-3 py-3.5 text-center sm:py-4">
            <p className="text-[10px] text-muted">{t(M.dashboard.attendanceRate)}</p>
            <p className="mt-1 text-base font-extrabold text-ink sm:text-lg">
              {percent(attendance.rate)}
            </p>
          </div>
          <div className="px-3 py-3.5 text-center sm:py-4">
            <p className="text-[10px] text-muted">
              {t(canSeeFinance ? M.players.debtWord : M.players.matchesWord)}
            </p>
            <p
              className={cn(
                "mt-1 text-base font-extrabold sm:text-lg",
                canSeeFinance && debt > 0 ? "text-rose-600" : "text-ink",
              )}
            >
              {canSeeFinance ? (debt > 0 ? toman(debt) : t(M.players.settledChip)) : faNum(stats.matches)}
            </p>
            {canSeeFinance && shopDebt > 0 ? (
              <p className="mt-0.5 text-[9px] text-muted">
                {t(M.players.includesShop, { amount: compactToman(shopDebt) })}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={tabs.map((item) => ({ value: item.value, label: t(item.label) }))}
      />

      {tab === "stats" ? (
        statRows.length ? (
          <div className="space-y-2.5">
            {statRows.map(({ stat, event }) => (
              <Card key={stat.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {event?.title ?? t(M.players.matchWord)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {event ? formatDay(event.startsAt) : ""}
                      {event?.opponent ? ` · ${t(M.dashboard.versus, { opponent: event.opponent })}` : ""}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-lg font-extrabold text-brand-700">
                      {faNum(stat.servePoints + stat.attackPoints + stat.blockPoints)}
                    </p>
                    <p className="text-[9px] text-muted">{statLabels.total}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-1.5">
                  {[
                    { label: statLabels.serve, value: stat.servePoints },
                    { label: statLabels.attack, value: stat.attackPoints },
                    { label: statLabels.block, value: stat.blockPoints },
                    { label: statLabels.digs, value: stat.digs },
                    { label: statLabels.errors, value: stat.errors },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg bg-slate-50 px-1 py-1.5 text-center">
                      <p className="text-[12px] font-bold text-ink">{faNum(item.value)}</p>
                      <p className="text-[9px] text-muted">{item.label}</p>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Trophy className="h-5 w-5" />}
            title={t(M.players.noStatsTitle)}
            description={t(M.players.noStatsDesc)}
          />
        )
      ) : null}

      {tab === "attendance" ? (
        <>
          <Card className="grid grid-cols-4 divide-x divide-line/70 rtl:divide-x-reverse text-center">
            {(["present", "late", "absent", "excused"] as const).map((status) => (
              <div key={status} className="px-2 py-3">
                <p
                  className={cn(
                    "text-base font-extrabold",
                    {
                      present: "text-emerald-600",
                      late: "text-amber-600",
                      absent: "text-rose-600",
                      excused: "text-slate-500",
                    }[status],
                  )}
                >
                  {faNum(attendance[status])}
                </p>
                <p className="mt-0.5 text-[10px] text-muted">{ATTENDANCE_LABELS[status]}</p>
              </div>
            ))}
          </Card>

          {attendanceRows.length ? (
            <Card className="divide-y divide-line/70 overflow-hidden">
              {attendanceRows.map(({ record, event }) => (
                <div key={record.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-50 text-muted">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-ink">
                      {event?.title ?? t(M.players.practiceSession)}
                    </p>
                    <p className="text-[10px] text-muted">
                      {event ? `${formatDay(event.startsAt)} · ${formatTime(event.startsAt)}` : ""}
                    </p>
                  </div>
                  <Badge tone={attendanceTone[record.status]}>
                    {ATTENDANCE_LABELS[record.status]}
                  </Badge>
                </div>
              ))}
            </Card>
          ) : (
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title={t(M.players.noAttendanceTitle)}
              description={t(M.players.noAttendanceDesc)}
            />
          )}
        </>
      ) : null}

      {tab === "finance" && canSeeFinance ? (
        <div className="space-y-3">
          {canPay ? (
            <div className="space-y-2">
              <Button className="w-full" onClick={() => setTuitionReceiptOpen(true)}>
                <ReceiptText className="h-4 w-4" />
                {t(M.payment.receiveTuition)}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setOpeningDebtOpen(true)}
                disabled={openingDebtPaid > 0}
              >
                <Wallet className="h-4 w-4" />
                {t(openingDebtInvoice ? M.openingDebt.editButton : M.openingDebt.button)}
              </Button>
              {openingDebtPaid > 0 ? (
                <p className="px-1 text-[10px] leading-5 text-muted">{t(M.openingDebt.locked)}</p>
              ) : null}
            </div>
          ) : null}
          {invoices.length ? (
            <div className="space-y-2.5">
              {invoices.map((invoice) => {
                const badge = invoiceBadge(invoice, data);
                const paid = invoicePaidAmount(invoice, data);
                const remaining = invoiceRemaining(invoice, data);
                const progress = invoice.amount ? (paid / invoice.amount) * 100 : 0;
                const discount = invoice.discountAmount ?? 0;
                return (
                  <Card key={invoice.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold text-ink">{invoice.title}</p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {t(M.players.dueOn, { date: formatDateFull(invoice.dueAt) })}
                        </p>
                        {invoice.note ? (
                          <p className="mt-0.5 text-[10px] text-muted">{invoice.note}</p>
                        ) : null}
                        {invoice.subtotal !== undefined || discount > 0 ? (
                          <div className="mt-1 space-y-0.5 text-[10px] text-muted">
                            <p>
                              {t(M.payment.tuitionSubtotal)}: {toman(invoice.subtotal ?? invoice.amount + discount)}
                              {discount > 0 ? ` · ${t(M.payment.discountWord)}: −${toman(discount)}` : ""}
                            </p>
                          </div>
                        ) : null}
                      </div>
                      <Badge tone={badge.tone}>{t(badge.message)}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px]">
                      <span className="text-muted">
                        {t(M.players.paidOf, { paid: toman(paid), total: toman(invoice.amount) })}
                      </span>
                      <span
                        className={cn(
                          "font-bold",
                          remaining > 0 ? "text-rose-600" : "text-emerald-600",
                        )}
                      >
                        {remaining > 0
                          ? t(M.players.remaining, { amount: toman(remaining) })
                          : t(M.players.settledChip)}
                      </span>
                    </div>
                    <Progress
                      value={progress}
                      className="mt-2"
                      tone={remaining > 0 ? "bg-amber-500" : "bg-emerald-500"}
                    />
                    {canPay && remaining > 0 ? (
                      <Button
                        size="sm"
                        variant="soft"
                        className="mt-3 w-full"
                        onClick={() => setPaymentInvoiceId(invoice.id)}
                      >
                        <ReceiptText className="h-3.5 w-3.5" />
                        {t(M.dashboard.recordPayment)}
                      </Button>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title={t(M.players.noInvoiceTitle)}
              description={t(M.players.noInvoiceDesc)}
            />
          )}
        </div>
      ) : null}

      {canEdit ? (
        <PlayerFormSheet
          key={player.id}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          player={player}
        />
      ) : null}
      <PaymentSheet
        open={paymentInvoiceId !== null}
        onClose={() => setPaymentInvoiceId(null)}
        invoiceId={paymentInvoiceId}
      />
      {canPay ? (
        <TuitionReceiptSheet
          player={player}
          open={tuitionReceiptOpen}
          onClose={() => setTuitionReceiptOpen(false)}
        />
      ) : null}
      {canPay ? (
        <OpeningDebtSheet
          player={player}
          invoice={openingDebtInvoice}
          open={openingDebtOpen}
          onClose={() => setOpeningDebtOpen(false)}
        />
      ) : null}
    </div>
  );
}
