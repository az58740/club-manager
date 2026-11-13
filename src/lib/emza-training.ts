import type { ClubData, Position } from "./types";
import { faDate } from "./date";
import { faNum } from "./format";
import { playerAttendance, playerStats, upcomingEvents } from "./selectors";
import { M, tr } from "./i18n/messages";

const dayMs = 24 * 60 * 60 * 1000;

export interface TrainingFocus {
  key: string;
  title: string;
  detail: string;
  reason: string;
}

export interface TrainingPlan {
  headline: string;
  blocks: string[];
  focus: TrainingFocus[];
  notes: string[];
}

function daysSince(value: string | Date, now: Date) {
  return Math.max(0, Math.round((+now - +new Date(value)) / dayMs));
}

function lastTraining(data: ClubData, now: Date) {
  return [...data.events]
    .filter((event) => event.type === "training" && +new Date(event.startsAt) < +now)
    .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt))[0] ?? null;
}

function positionCounts(data: ClubData, teamId: string) {
  const counts = new Map<Position, number>();
  for (const player of data.players) {
    if (teamId && player.teamId !== teamId) continue;
    counts.set(player.position, (counts.get(player.position) ?? 0) + 1);
  }
  return counts;
}

export function buildTrainingPlan(data: ClubData, now = new Date()): TrainingPlan {
  const upcoming = upcomingEvents(data, now);
  const nextMatch = upcoming.find((event) => event.type === "match") ?? null;
  const nextTraining = lastTraining(data, now);
  const gapDays = nextTraining ? daysSince(nextTraining.startsAt, now) : null;
  const roster = data.players;
  const teamId = nextMatch?.teamId ?? roster[0]?.teamId ?? "";
  const counts = positionCounts(data, teamId);
  const setters = counts.get("setter") ?? 0;
  const liberos = counts.get("libero") ?? 0;
  const middle = counts.get("middle") ?? 0;

  const attack = sumStat(data, "attackPoints");
  const serve = sumStat(data, "servePoints");
  const block = sumStat(data, "blockPoints");
  const digs = sumStat(data, "digs");
  const errors = sumStat(data, "errors");
  const totalPoints = attack + serve + block;
  const six = tr(M.emzaTrain.sixVsSix);

  const focus: TrainingFocus[] = [];

  if (gapDays !== null && gapDays >= 5) {
    focus.push({
      key: "reentry",
      title: tr(M.emzaTrain.reentryTitle),
      detail: tr(M.emzaTrain.reentryDetail, {
        a: faNum(10),
        b: faNum(10),
        six,
      }),
      reason: tr(M.emzaTrain.reentryReason, { days: faNum(gapDays) }),
    });
  }

  if (nextMatch) {
    focus.push({
      key: "match",
      title: tr(M.emzaTrain.matchTitle, { opponent: nextMatch.opponent || tr(M.schedule.opponentWord) }),
      detail: tr(M.emzaTrain.matchDetail, { a: faNum(20), b: faNum(15) }),
      reason: tr(M.emzaTrain.matchReason, { date: faDate(nextMatch.startsAt) }),
    });
  }

  if (totalPoints > 0 && errors / Math.max(totalPoints, 1) > 0.25) {
    focus.push({
      key: "control",
      title: tr(M.emzaTrain.controlTitle),
      detail: tr(M.emzaTrain.controlDetail, { a: faNum(15), rate: faNum(70), b: faNum(10) }),
      reason: tr(M.emzaTrain.controlReason, {
        errors: faNum(errors),
        points: faNum(totalPoints),
      }),
    });
  }

  if (digs < attack * 0.4 || (roster.length > 0 && digs === 0)) {
    focus.push({
      key: "defense",
      title: tr(M.emzaTrain.defenseTitle),
      detail: tr(M.emzaTrain.defenseDetail, { a: faNum(15), b: faNum(10) }),
      reason: tr(M.emzaTrain.defenseReason),
    });
  }

  if (block < attack * 0.3) {
    focus.push({
      key: "block",
      title: tr(M.emzaTrain.blockTitle),
      detail: tr(M.emzaTrain.blockDetail, { a: faNum(12), b: faNum(8) }),
      reason: tr(M.emzaTrain.blockReason, { block: faNum(block), attack: faNum(attack) }),
    });
  }

  if (serve < attack * 0.25) {
    focus.push({
      key: "serve",
      title: tr(M.emzaTrain.serveTitle),
      detail: tr(M.emzaTrain.serveDetail, { a: faNum(10), b: faNum(5) }),
      reason: tr(M.emzaTrain.serveReason, { serve: faNum(serve) }),
    });
  }

  if (setters <= 1) {
    focus.push({
      key: "setter",
      title: tr(M.emzaTrain.setterTitle),
      detail: tr(M.emzaTrain.setterDetail, {
        a: faNum(10),
        b: faNum(5),
        two: tr(M.emzaTrain.twoVsTwo),
      }),
      reason: tr(M.emzaTrain.setterReason, { count: faNum(setters || 0) }),
    });
  }

  if (liberos === 0 && roster.length >= 6) {
    focus.push({
      key: "libero",
      title: tr(M.emzaTrain.liberoTitle),
      detail: tr(M.emzaTrain.liberoDetail, { a: faNum(15) }),
      reason: tr(M.emzaTrain.liberoReason),
    });
  }

  if (middle === 0 && data.club.sport === "volleyball") {
    focus.push({
      key: "middle",
      title: tr(M.emzaTrain.middleTitle),
      detail: tr(M.emzaTrain.middleDetail, { a: faNum(10) }),
      reason: tr(M.emzaTrain.middleReason),
    });
  }

  const weakAttendance = roster
    .map((player) => ({ player, rate: playerAttendance(data, player.id).rate }))
    .filter((row) => row.rate < 70);
  const notes: string[] = [];
  if (weakAttendance.length) {
    notes.push(
      tr(M.emzaTrain.weakAttendance, {
        names: weakAttendance
          .slice(0, 3)
          .map((row) =>
            tr(M.emzaTrain.attendanceName, {
              name: row.player.fullName,
              rate: faNum(Math.round(row.rate)),
            }),
          )
          .join(tr(M.emzaTrain.joinList)),
      }),
    );
  }
  const scorers = [...roster]
    .map((player) => ({ player, stats: playerStats(data, player.id) }))
    .filter((row) => row.stats.matches > 0)
    .sort((a, b) => b.stats.points - a.stats.points)[0];
  if (scorers) {
    notes.push(
      tr(M.emzaTrain.topScorer, {
        name: scorers.player.fullName,
        points: faNum(scorers.stats.points),
      }),
    );
  }

  const heavy = focus.some((row) => row.key === "match" || row.key === "block");
  const minutes = data.club.sport === "volleyball" ? (heavy ? 105 : 90) : 90;

  const blocks = [
    tr(M.emzaTrain.warmUp, { min: faNum(15) }),
    focus.length
      ? tr(M.emzaTrain.mainSection, {
          titles: focus.slice(0, 2).map((row) => row.title).join(" + "),
          min: faNum(35),
        })
      : tr(M.emzaTrain.mainDefault, { min: faNum(35) }),
    focus.slice(2, 4).length
      ? tr(M.emzaTrain.extraSection, {
          titles: focus.slice(2, 4).map((row) => row.title).join(" + "),
          min: faNum(20),
        })
      : tr(M.emzaTrain.extraDefault, { min: faNum(20) }),
    tr(M.emzaTrain.scrimmage, { six, min: faNum(heavy ? 25 : 20) }),
    tr(M.emzaTrain.coolDown, { min: faNum(10) }),
    tr(M.emzaTrain.loadModel, {
      load: tr(heavy ? M.emzaTrain.loadHeavy : M.emzaTrain.loadMedium),
      minutes: faNum(minutes),
    }),
  ];

  return {
    headline:
      data.club.sport !== "volleyball"
        ? tr(M.emzaTrain.headlineGeneric)
        : tr(M.emzaTrain.headlineVolleyball, { count: faNum(roster.length) }),
    blocks,
    focus: focus.slice(0, 5),
    notes,
  };
}

function sumStat(data: ClubData, key: "servePoints" | "attackPoints" | "blockPoints" | "digs" | "errors") {
  return data.stats.reduce((sum, stat) => sum + stat[key], 0);
}

export function formatPlan(plan: TrainingPlan) {
  const lines: string[] = [plan.headline + tr(M.emzaTrain.colon)];
  for (const block of plan.blocks) lines.push(`• ${block}`);
  if (plan.focus.length) {
    lines.push(tr(M.emzaTrain.focusHeading));
    for (const item of plan.focus) {
      lines.push(tr(M.emzaTrain.focusLine, { title: item.title, detail: item.detail, reason: item.reason }));
    }
  }
  for (const note of plan.notes) lines.push(tr(M.emzaTrain.noteLine, { note }));
  return lines.join("\n");
}
