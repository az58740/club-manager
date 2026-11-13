import type {
  Attendance,
  AttendanceStatus,
  ClubData,
  ClubEvent,
  Invoice,
  MatchStat,
  Player,
  Sport,
  Team,
} from "./types";
import { shortMonthName } from "./date";

export type InvoiceState = "paid" | "partial" | "unpaid";

export function invoicePaidAmount(invoice: Invoice, data: ClubData) {
  return data.payments
    .filter((payment) => payment.invoiceId === invoice.id)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function invoiceRemaining(invoice: Invoice, data: ClubData) {
  return Math.max(invoice.amount - invoicePaidAmount(invoice, data), 0);
}

export function invoiceState(invoice: Invoice, data: ClubData): InvoiceState {
  const paid = invoicePaidAmount(invoice, data);
  if (paid >= invoice.amount) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}

export function isInvoiceOverdue(invoice: Invoice, data: ClubData, now = new Date()) {
  return invoiceState(invoice, data) !== "paid" && new Date(invoice.dueAt) < now;
}

export function playerDebt(playerId: string, data: ClubData) {
  return data.invoices
    .filter((invoice) => invoice.playerId === playerId)
    .reduce((sum, invoice) => sum + invoiceRemaining(invoice, data), 0);
}

export function playerShopDebt(playerId: string, data: ClubData) {
  return data.transactions
    .filter(
      (entry) =>
        entry.playerId === playerId &&
        entry.kind === "income" &&
        entry.credit === true &&
        entry.settled === false,
    )
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export function playerTotalDebt(playerId: string, data: ClubData) {
  return playerDebt(playerId, data) + playerShopDebt(playerId, data);
}

export interface DebtRow {
  player: Player;
  tuition: number;
  shop: number;
  total: number;
}

export function debtorBreakdown(data: ClubData): DebtRow[] {
  return data.players
    .map((player) => {
      const tuition = playerDebt(player.id, data);
      const shop = playerShopDebt(player.id, data);
      return { player, tuition, shop, total: tuition + shop };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function totalOutstanding(data: ClubData) {
  return data.invoices.reduce((sum, invoice) => sum + invoiceRemaining(invoice, data), 0);
}

export function totalInvoiced(data: ClubData) {
  return data.invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
}

export function playerById(data: ClubData, playerId: string) {
  return data.players.find((player) => player.id === playerId);
}

export function teamById(data: ClubData, teamId: string) {
  return data.teams.find((team) => team.id === teamId);
}

export function playersOfTeam(data: ClubData, teamId: string) {
  return data.players.filter((player) => player.teamId === teamId);
}

export function playerStats(data: ClubData, playerId: string) {
  const rows = data.stats.filter((stat) => stat.playerId === playerId);
  return {
    rows,
    matches: rows.length,
    serve: rows.reduce((sum, row) => sum + row.servePoints, 0),
    attack: rows.reduce((sum, row) => sum + row.attackPoints, 0),
    block: rows.reduce((sum, row) => sum + row.blockPoints, 0),
    digs: rows.reduce((sum, row) => sum + row.digs, 0),
    errors: rows.reduce((sum, row) => sum + row.errors, 0),
    points: rows.reduce(
      (sum, row) => sum + row.servePoints + row.attackPoints + row.blockPoints,
      0,
    ),
  };
}

export function playerAttendance(data: ClubData, playerId: string) {
  const rows = data.attendance.filter((record) => record.playerId === playerId);
  const counted = rows.filter((record) => record.status === "present" || record.status === "late");
  return {
    rows,
    total: rows.length,
    present: rows.filter((record) => record.status === "present").length,
    late: rows.filter((record) => record.status === "late").length,
    absent: rows.filter((record) => record.status === "absent").length,
    excused: rows.filter((record) => record.status === "excused").length,
    rate: rows.length ? (counted.length / rows.length) * 100 : 0,
  };
}

export function eventAttendance(data: ClubData, eventId: string) {
  return data.attendance.filter((record) => record.eventId === eventId);
}

export function attendanceBreakdown(records: Attendance[]) {
  const base: Record<AttendanceStatus, number> = {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
  };
  for (const record of records) base[record.status] += 1;
  const total = records.length;
  const attended = base.present + base.late;
  return { ...base, total, attendanceRate: total ? (attended / total) * 100 : 0 };
}

export function upcomingEvents(data: ClubData, now = new Date()) {
  return data.events
    .filter((event) => new Date(event.startsAt) >= now && event.status === "scheduled")
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
}

export function pastEvents(data: ClubData, now = new Date()) {
  return data.events
    .filter((event) => new Date(event.startsAt) < now || event.status === "done")
    .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
}

export function nextEvent(data: ClubData, now = new Date()) {
  return upcomingEvents(data, now)[0] ?? null;
}

export function eventById(data: ClubData, eventId: string) {
  return data.events.find((event) => event.id === eventId);
}

export function matchScore(event: ClubEvent, sport: Sport = "volleyball") {
  if (!event.sets?.length) return { home: 0, away: 0 };
  if (sport !== "volleyball") {
    return event.sets.reduce(
      (total, set) => ({ home: total.home + set.home, away: total.away + set.away }),
      { home: 0, away: 0 },
    );
  }
  let home = 0;
  let away = 0;
  for (const set of event.sets) {
    if (set.home > set.away) home += 1;
    else if (set.away > set.home) away += 1;
  }
  return { home, away };
}

export function teamRecord(data: ClubData, teamId: string) {
  const matches = data.events.filter(
    (event) => event.teamId === teamId && event.type === "match" && event.sets?.length,
  );
  let wins = 0;
  let losses = 0;
  for (const match of matches) {
    const score = matchScore(match, data.club.sport);
    if (score.home > score.away) wins += 1;
    else if (score.away > score.home) losses += 1;
  }
  return { wins, losses, played: wins + losses };
}

export function teamAttendanceRate(data: ClubData, teamId: string) {
  const rosterIds = new Set(playersOfTeam(data, teamId).map((player) => player.id));
  const records = data.attendance.filter((record) => rosterIds.has(record.playerId));
  return attendanceBreakdown(records).attendanceRate;
}

export function topScorers(data: ClubData, limit = 5) {
  return data.players
    .map((player) => ({ player, stats: playerStats(data, player.id) }))
    .filter((row) => row.stats.matches > 0)
    .sort((a, b) => b.stats.points - a.stats.points)
    .slice(0, limit);
}

export function monthPayments(data: ClubData, now = new Date()) {
  return data.payments.filter((payment) => {
    const paidAt = new Date(payment.paidAt);
    return paidAt.getFullYear() === now.getFullYear() && paidAt.getMonth() === now.getMonth();
  });
}

export function lastSixMonthRevenue(data: ClubData, now = new Date(), playerId?: string) {
  const months: Array<{ label: string; amount: number; start: Date }> = [];
  for (let i = 5; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const amount = data.payments
      .filter((payment) => {
        const paidAt = new Date(payment.paidAt);
        return paidAt >= start && paidAt < end && (!playerId || payment.playerId === playerId);
      })
      .reduce((sum, payment) => sum + payment.amount, 0);
    months.push({
      label: shortMonthName(start),
      amount,
      start,
    });
  }
  return months;
}

export function activePlayers(data: ClubData): Player[] {
  return data.players.filter((player) => player.status === "active");
}

export function teamSummary(data: ClubData, team: Team) {
  const roster = playersOfTeam(data, team.id);
  const record = teamRecord(data, team.id);
  const next = upcomingEvents(data).find((event) => event.teamId === team.id) ?? null;
  return {
    roster,
    activeCount: roster.filter((player) => player.status === "active").length,
    record,
    next,
    attendanceRate: teamAttendanceRate(data, team.id),
  };
}

export function matchStatsForEvent(data: ClubData, eventId: string): Array<{
  stat: MatchStat;
  player: Player;
}> {
  return data.stats
    .filter((stat) => stat.eventId === eventId)
    .map((stat) => ({ stat, player: playerById(data, stat.playerId) }))
    .filter((row): row is { stat: MatchStat; player: Player } => Boolean(row.player))
    .sort(
      (a, b) =>
        b.stat.servePoints +
        b.stat.attackPoints +
        b.stat.blockPoints -
        (a.stat.servePoints + a.stat.attackPoints + a.stat.blockPoints),
    );
}
