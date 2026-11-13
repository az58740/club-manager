import type {
  ClubData,
  LedgerMethod,
  PaymentMethod,
  Player,
  Position,
  Role,
  TeamColor,
  TransactionKind,
} from "./types";
import { SPORT_POSITIONS } from "./labels";
import { faDate, formatMonthYear, formatTime, parseJalaliInput } from "./date";
import { faNum, toman, uid } from "./format";
import { invoiceRemaining, nextEvent, playerTotalDebt, upcomingEvents } from "./selectors";
import { defaultAccountId } from "./finance";
import { buildTrainingPlan, formatPlan } from "./emza-training";
import { M, tr } from "./i18n/messages";
import { getLocale } from "./i18n/locale";

export interface EmzaResult {
  reply: string;
  data?: ClubData;
  href?: string;
}

export interface EmzaContext {
  role: Role;
  now?: Date;
}

export function normalizeFa(input: string) {
  return input
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[أإآ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/[‌‏‎]/g, " ")
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/[۰-۹]/g, (ch) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(ch)))
    .replace(/[٠-٩]/g, (ch) => String("٠١٢٣٤٥٦٧٨٩".indexOf(ch)))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* Everything below this line is *input* vocabulary: the words Emza listens for,
   in both languages. It is deliberately Persian even in English mode, because a
   user may address the assistant in either language at any moment. */

const ONES: Record<string, number> = {
  صفر: 0,
  یک: 1,
  دو: 2,
  سه: 3,
  چهار: 4,
  پنج: 5,
  شش: 6,
  هفت: 7,
  هشت: 8,
  نه: 9,
  ده: 10,
  یازده: 11,
  دوازده: 12,
  سیزده: 13,
  چهارده: 14,
  پانزده: 15,
  شانزده: 16,
  هفده: 17,
  هجده: 18,
  نوزده: 19,
  بیست: 20,
};

const TENS: Record<string, number> = {
  سی: 30,
  چهل: 40,
  پنجاه: 50,
  شصت: 60,
  هفتاد: 70,
  هشتاد: 80,
  نود: 90,
};

const HUNDREDS: Record<string, number> = {
  دویست: 200,
  سیصد: 300,
  چهارصد: 400,
  پانصد: 500,
  ششصد: 600,
  هفتصد: 700,
  هشتصد: 800,
  نهصد: 900,
};

const EN_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const HUNDRED_WORDS = new Set(["صد", "یکصد", "hundred"]);

const SCALE_WORDS: Record<string, number> = {
  هزار: 1_000,
  میلیون: 1_000_000,
  میلیارد: 1_000_000_000,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
};

const NUMBER_FILLER = new Set(["و", "and"]);

export function readNumber(text: string): number | null {
  const clean = normalizeFa(text).replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (/^[\d.,]+$/.test(clean)) {
    const value = Number(clean.replace(/[,.]/g, ""));
    return Number.isFinite(value) ? value : null;
  }
  let total = 0;
  let current = 0;
  let seen = false;
  for (const word of clean.split(" ")) {
    if (!word || NUMBER_FILLER.has(word)) continue;
    const value = ONES[word] ?? TENS[word] ?? HUNDREDS[word] ?? EN_NUMBERS[word];
    if (value !== undefined) {
      current += value;
      seen = true;
      continue;
    }
    if (HUNDRED_WORDS.has(word)) {
      current = (current || 1) * 100;
      seen = true;
      continue;
    }
    const scale = SCALE_WORDS[word];
    if (scale !== undefined) {
      total += (current || 1) * scale;
      current = 0;
      seen = true;
      continue;
    }
    return null;
  }
  return seen ? total + current : null;
}

function titleCaseAscii(value: string) {
  if (getLocale() === "en" && /^[a-z ]+$/i.test(value)) {
    return value.replace(/(^|\s)([a-z])/g, (_all, gap: string, letter: string) => gap + letter.toUpperCase());
  }
  return value;
}

function extractAfter(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

/** Keyword triggers Emza reacts to, in Persian and in English. */
const KW = {
  help: ["راهنما", "کمک", "چه کار", "چیکار", "بلدی", "help", "commands", "what can you do"],
  greet: ["سلام", "درود", "صبح بخیر", "hi", "hello", "hey"],
  navigate: ["برو به", "باز کن", "نشان بده صفحه", "صفحه", "منو", "go to", "open", "show", "page", "menu", "navigate"],
  suggest: ["پیشنهاد", "suggest", "recommend", "proposal", "plan"],
  practiceWord: ["تمرین", "practice", "training", "drill", "session"],
  matchWord: ["مسابقه", "match", "game"],
  nextEvent: [
    "تمرین بعدی",
    "مسابقه بعدی",
    "رویداد بعدی",
    "برنامه بعدی",
    "next practice",
    "next training",
    "next match",
    "next event",
    "next game",
    "next session",
  ],
  playerCount: ["چند بازیکن", "تعداد بازیکن", "چند عضو", "how many players", "number of players", "how many members"],
  playerWord: ["بازیکن", "بازیکنان", "عضو", "اعضا", "player", "players", "member", "members", "athlete"],
  teamWord: ["تیم", "تیم ها", "team", "teams", "squad"],
  actionAdd: ["ثبت", "اضافه", "بساز", "ایجاد", "جدید", "برنامه ریزی", "add", "register", "create", "new", "insert", "schedule", "plan"],
  debt: ["بدهی", "بدهکار", "debt", "debtors", "owe", "owes", "owing"],
  paid: ["پرداخت کرد", "پرداخت شد", "واریز کرد", "ثبت پرداخت", "paid", "payment", "pay"],
  invoice: ["شهریه", "فاکتور", "invoice", "bill", "tuition", "صورتحساب"],
  invoiceVerb: ["صادر", "بساز", "ساز", "ثبت", "issue", "create", "make", "generate", "فاکتور", "invoice", "bill"],
  ledger: ["هزینه", "درآمد", "expense", "cost", "income", "revenue"],
  attendance: ["حاضر", "غایب", "موجه", "تاخیر", "تأخیر", "present", "absent", "late", "excused", "attendance"],
  save: ["ثبت", "بساز", "اضافه", "save", "register", "add", "create"],
} as const;

const FIELD_STOPS =
  "موبایل|تلفن|شماره|پیراهن|پست|تیم|برای|شهریه|قد|با|سن|آدرس|with|mobile|phone|shirt|jersey|position|team|for|tuition|fee|height|age|address|at|on";

// Commands are often written as a comma list ("…, monthly fee 800 …"), so a field
// ends at punctuation as well as in front of the next field keyword.
const FIELD_END = `(?=[،,.]| (?:${FIELD_STOPS})|$)`;

// JS `\b` only counts ASCII letters as word characters, so it never fires after a
// Persian word; the Unicode class is what actually ends a field.
const WORD_TAIL = "(?![\\p{L}\\p{N}])";

function findTeam(data: ClubData, text: string) {
  const named = extractAfter(text, [
    /(?:برای|به|در) تیم ([^،,.]+?)(?=[،,.]| (?:با|پیراهن|شماره|پست|تلفن|موبایل|شهریه|ساعت|فردا|امروز|قد|آدرس)|$)/,
    /تیم ([^،,.]+?)(?=[،,.]| (?:با|پیراهن|شماره|پست|تلفن|موبایل|شهریه|ساعت|فردا|امروز)|$)/,
    new RegExp(`\\bfor (?:the )?([^،,.]+?) team\\b`, "u"),
    new RegExp(`\\bteam\\s+((?!${FIELD_STOPS}${WORD_TAIL})[^،,.]+?)${FIELD_END}`, "u"),
  ]);
  if (named) {
    const exact = data.teams.find((team) => normalizeFa(team.name) === normalizeFa(named));
    if (exact) return exact;
    const partial = data.teams.find((team) => normalizeFa(team.name).includes(normalizeFa(named)));
    if (partial) return partial;
  }
  return data.teams.find((team) => text.includes(normalizeFa(team.name))) ?? null;
}

function findPlayer(data: ClubData, text: string) {
  const sorted = [...data.players].sort((a, b) => b.fullName.length - a.fullName.length);
  const direct = sorted.find((player) => text.includes(normalizeFa(player.fullName)));
  if (direct) return direct;
  return (
    sorted.find((player) => {
      const parts = normalizeFa(player.fullName).split(" ");
      return parts.length > 1 && parts.every((part) => text.includes(part));
    }) ?? null
  );
}

const POSITION_WORDS: Record<Position, string[]> = {
  setter: ["پاسور", "setter", "set"],
  outside: ["مهاجم قدرتی", "outside hitter", "outside", "wing spiker"],
  middle: ["دفاع وسط", "middle blocker", "middle"],
  opposite: ["اوپوزیت", "opposite", "oppo"],
  libero: ["لیبرو", "libero"],
  "point-guard": ["پوینت گارد", "point guard"],
  "shooting-guard": ["شوتینگ گارد", "shooting guard"],
  "small-forward": ["اسمال فوروارد", "small forward"],
  "power-forward": ["پاور فوروارد", "power forward"],
  center: ["سنتر", "center", "centre"],
  goalkeeper: ["دروازه بان", "goalkeeper", "goalie"],
  defender: ["مدافع", "defender", "defence", "defense"],
  midfielder: ["هافبک", "midfielder", "midfield"],
  forward: ["مهاجم", "forward", "striker"],
  training: ["آموزشی", "development", "trialist", "trial"],
};

const POSITION_MATCHES: Array<{ position: Position; word: string }> = Object.entries(POSITION_WORDS)
  .flatMap(([position, words]) => words.map((word) => ({ position: position as Position, word: normalizeFa(word) })))
  .sort((a, b) => b.word.length - a.word.length);

function findPosition(data: ClubData, text: string): Position | null {
  const allowed = SPORT_POSITIONS[data.club.sport];
  for (const candidate of POSITION_MATCHES) {
    if (allowed.includes(candidate.position) && text.includes(candidate.word)) return candidate.position;
  }
  return null;
}

function extractPhone(text: string) {
  const match = text.match(
    /(?:تلفن|موبایل|شماره تماس|شماره همراه|phone|mobile|cell)\s*(?:\D{0,12})?([\d+ -]{7,15})/,
  );
  return match ? match[1].replace(/[\s-]/g, "") : "";
}

const AMOUNT_UNITS =
  "هزار تومان|هزار تومن|میلیون تومان|میلیون تومن|تومان|تومن|thousand toman|thousand tomans|thousand|million toman|million tomans|million|toman|tomans|tooman";

function extractAmount(text: string) {
  const match = text.match(
    new RegExp(`([\\d.,]+|[\\p{L} ]+?)\\s*(${AMOUNT_UNITS})${WORD_TAIL}`, "u"),
  );
  if (!match) return null;
  const base = readNumber(match[1]);
  if (base === null) return null;
  const unit = match[2];
  if (unit.startsWith("هزار") || /^thousand\b/.test(unit)) return base * 1_000;
  if (unit.startsWith("میلیون") || /^million\b/.test(unit)) return base * 1_000_000;
  return base;
}

function resolveDate(text: string, now: Date) {
  const date = new Date(now);
  if (has(text, ["پس فردا", "day after tomorrow"])) date.setDate(date.getDate() + 2);
  else if (has(text, ["فردا", "tomorrow"])) date.setDate(date.getDate() + 1);
  else if (has(text, ["دیروز", "yesterday"])) date.setDate(date.getDate() - 1);
  else if (/\d{4}\/\d{1,2}\/\d{1,2}/.test(text)) {
    const parsed = parseJalaliInput(text.match(/\d{4}\/\d{1,2}\/\d{1,2}/)![0]);
    if (parsed) return parsed;
  }
  return date;
}

function extractTime(text: string, date: Date) {
  const clock = text.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (clock && Number(clock[1]) <= 23 && Number(clock[2]) <= 59) {
    date.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    return;
  }
  const pmAm = text.match(/\b(\d{1,2})\s*(pm|am)\b/);
  if (pmAm) {
    let hour = Number(pmAm[1]);
    if (pmAm[2] === "pm" && hour < 12) hour += 12;
    if (pmAm[2] === "am" && hour === 12) hour = 0;
    date.setHours(hour, 0, 0, 0);
    return;
  }
  const keyed = text.match(/(?:ساعت|at|ساعت\s*حدود)\s*([\p{L}\d ]+)/u);
  if (keyed) {
    const raw = keyed[1].trim();
    const digits = raw.match(/^(\d{1,2})/);
    if (digits) {
      date.setHours(Number(digits[1]), 0, 0, 0);
      return;
    }
    const hour = readNumber(raw.split(/[,،]/)[0]);
    if (hour !== null && hour >= 0 && hour <= 23) {
      date.setHours(hour, 0, 0, 0);
      return;
    }
  }
  date.setHours(18, 0, 0, 0);
}

function has(text: string, words: readonly string[]) {
  return words.some((word) => matchWord(text, word));
}

/** English triggers need word boundaries («add» must not fire on «address»). */
function matchWord(text: string, word: string) {
  return /^[\x00-\x7F]+$/.test(word) ? new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text) : text.includes(word);
}

const NAV: Array<{ words: string[]; href: string; label: () => string }> = [
  { words: ["دفتر کل", "ledger"], href: "/finances/ledger", label: () => tr(M.emza.navLedger) },
  { words: ["حساب ها", "چک", "accounts", "cheque", "check"], href: "/finances/accounts", label: () => tr(M.emza.navAccounts) },
  { words: ["فروشگاه", "انبار", "کالا", "shop", "store", "inventory"], href: "/finances/shop", label: () => tr(M.emza.navShop) },
  { words: ["شهریه", "مالی", "finances", "tuition"], href: "/finances", label: () => tr(M.emza.navFinances) },
  { words: ["بازیکنان", "بازیکن ها", "اعضا", "players", "members"], href: "/players", label: () => tr(M.emza.navPlayers) },
  { words: ["تیم ها", "تیم", "teams"], href: "/teams", label: () => tr(M.emza.navTeams) },
  { words: ["برنامه", "تمرین ها", "مسابقه ها", "schedule", "calendar"], href: "/schedule", label: () => tr(M.emza.navSchedule) },
  { words: ["کاربران", "مربی ها", "users", "coaches"], href: "/users", label: () => tr(M.emza.navUsers) },
  { words: ["تنظیمات", "settings"], href: "/settings", label: () => tr(M.emza.navSettings) },
  { words: ["خانه", "داشبورد", "صفحه اصلی", "home", "dashboard", "overview"], href: "/", label: () => tr(M.emza.navHome) },
];

function teamNames(data: ClubData) {
  return data.teams.map((row) => row.name).join(tr(M.emzaTrain.joinList));
}

export function runEmza(input: string, data: ClubData, context: EmzaContext): EmzaResult {
  const text = normalizeFa(input);
  const now = context.now ?? new Date();
  if (!text) return { reply: tr(M.emza.nothingHeard) };
  if (has(text, KW.help)) return { reply: tr(M.emza.help) };
  if (has(text, KW.greet) && text.length < 25) return { reply: tr(M.emza.greeting) };

  if (has(text, KW.navigate)) {
    const item = NAV.find((entry) => has(text, entry.words));
    if (item) return { reply: tr(M.emza.openingPage, { label: item.label() }), href: item.href };
  }

  if (has(text, KW.suggest) && has(text, KW.practiceWord)) {
    const plan = buildTrainingPlan(data, now);
    if (has(text, KW.save)) return suggestTrainingAsEvent(plan, data, text, now);
    return { reply: formatPlan(plan), href: "/schedule" };
  }

  if (has(text, KW.nextEvent)) {
    const event = nextEvent(data, now);
    if (!event) return { reply: tr(M.emza.noUpcoming) };
    const team = data.teams.find((row) => row.id === event.teamId)?.name ?? "";
    const parts = [event.title, team, faDate(event.startsAt), event.location].filter(Boolean).join(tr(M.emza.listSeparator));
    return {
      reply: tr(M.emza.nextEventReply, { parts }),
      href: `/schedule/?id=${event.id}`,
    };
  }

  if (has(text, KW.playerCount)) {
    const active = data.players.filter((player) => player.status === "active").length;
    return { reply: tr(M.emza.rosterCount, { total: faNum(data.players.length), active: faNum(active) }) };
  }

  if (has(text, KW.debt)) {
    const player = findPlayer(data, text);
    if (player) {
      const debt = playerTotalDebt(player.id, data);
      return {
        reply: debt
          ? tr(M.emza.debtOf, { name: player.fullName, amount: toman(debt) })
          : tr(M.emza.noDebt, { name: player.fullName }),
        href: `/players/?id=${player.id}`,
      };
    }
    const debtors = data.players
      .map((row) => ({ row, debt: playerTotalDebt(row.id, data) }))
      .filter((entry) => entry.debt > 0)
      .sort((a, b) => b.debt - a.debt);
    if (!debtors.length) return { reply: tr(M.emza.noOpenDebt) };
    return {
      reply: debtors
        .slice(0, 5)
        .map((entry) => tr(M.emza.debtOf, { name: entry.row.fullName, amount: toman(entry.debt) }))
        .join("\n"),
    };
  }

  if (has(text, KW.playerWord) && has(text, KW.actionAdd)) return addPlayer(text, data);

  if (has(text, [...KW.practiceWord, ...KW.matchWord]) && has(text, KW.actionAdd)) return addEvent(text, data, now);

  if (has(text, KW.teamWord) && has(text, KW.actionAdd) && !has(text, [...KW.playerWord, ...KW.practiceWord, ...KW.matchWord]))
    return addTeam(text, data);

  if (has(text, KW.attendance)) {
    const result = markAttendance(text, data);
    if (result) return result;
  }

  if (has(text, KW.paid)) {
    if (context.role === "coach") return { reply: tr(M.emza.managerOnlyPayment) };
    return addPayment(text, data, now);
  }

  if (has(text, KW.invoice) && has(text, KW.invoiceVerb)) {
    if (context.role === "coach") return { reply: tr(M.emza.managerOnlyInvoice) };
    return addInvoice(text, data, now);
  }

  if (has(text, KW.ledger) && has(text, ["ثبت", "اضافه", "add", "register", "record"])) {
    if (context.role === "coach") return { reply: tr(M.emza.managerOnlyLedger) };
    return addTransaction(text, data, now);
  }

  return { reply: `${tr(M.emza.notUnderstood)} ${tr(M.emza.help)}` };
}

function suggestTrainingAsEvent(
  plan: ReturnType<typeof buildTrainingPlan>,
  data: ClubData,
  text: string,
  now: Date,
): EmzaResult {
  const team = findTeam(data, text) ?? (data.teams.length === 1 ? data.teams[0] : null);
  if (!team && data.teams.length > 1) {
    return { reply: tr(M.emza.askTeamPlan, { teams: teamNames(data) }) };
  }
  const date = resolveDate(text, now);
  extractTime(text, date);
  const focusTitle = plan.focus[0]?.title ?? tr(M.emza.basicPractice);
  const event = {
    id: uid("event"),
    type: "training" as const,
    teamId: team?.id ?? "",
    title: tr(M.emza.trainingEventTitle, { focus: focusTitle }),
    location: team?.homeVenue || tr(M.eventForm.defaultVenue),
    startsAt: date.toISOString(),
    durationMin: 90,
    status: "scheduled" as const,
    notes: formatPlan(plan),
    reminderNote: plan.focus.map((row) => row.title).join(" · ") || tr(M.emza.basicPractice),
  };
  return {
    reply: tr(M.emza.planSaved, { title: event.title, date: faDate(date) }),
    data: { ...data, events: [...data.events, event] },
    href: `/schedule/?id=${event.id}`,
  };
}

function addPlayer(text: string, data: ClubData): EmzaResult {
  let name = extractAfter(text, [
    new RegExp(`(?:به نام|نام|اسم|named|called)\\s+([^،,.]+?)${FIELD_END}`, "u"),
    new RegExp(`(?:بازیکن|عضو|player|member)\\s+(?:new\\s+)?([^،,.]+?)${FIELD_END}`, "u"),
  ]);
  name = titleCaseAscii(name.replace(/^(?:ثبت|اضافه|بساز|ایجاد|add|register|create)\s*/, "").trim());
  if (!name || name.length < 3 || has(name, ["ثبت کن", "جدید ثبت", "register"])) {
    return { reply: tr(M.emza.playerNameNeeded) };
  }
  const phone = extractPhone(text);
  const team = findTeam(data, text);
  const jerseyMatch = text.match(/(?:پیراهن|شماره پیراهن|shirt|jersey)\s*(?:شماره\s*|number\s*)?([\p{L}\d.,]+)/u);
  const jersey = jerseyMatch ? readNumber(jerseyMatch[1].trim()) : null;
  const fee = has(text, ["شهریه", "tuition", "fee"])
    ? extractAmount(text.slice(Math.max(text.search(/شهریه|tuition|fee/), 0)))
    : null;
  const position = findPosition(data, text) ?? "training";
  if (data.players.some((player) => normalizeFa(player.fullName) === normalizeFa(name))) {
    return { reply: tr(M.emza.playerExists, { name }) };
  }
  if (!team && data.teams.length) {
    return { reply: tr(M.emza.askTeamPlayer, { name, teams: teamNames(data) }) };
  }
  const player: Player = {
    id: uid("p"),
    fullName: name,
    phone,
    teamId: team?.id ?? "",
    position,
    jersey: jersey ?? 0,
    birthDate: "",
    heightCm: 0,
    status: "active",
    joinedAt: new Date().toISOString(),
    monthlyFee: fee ?? 0,
    insured: has(text, ["بیمه", "insurance", "insured"]) ? !has(text, ["بیمه ندارد", "no insurance", "uninsured"]) : undefined,
  };
  const parts = [
    team ? tr(M.emza.createdTeam, { team: team.name }) : "",
    jersey ? tr(M.emza.createdJersey, { jersey: faNum(jersey) }) : "",
    phone ? tr(M.emza.createdPhone, { phone }) : "",
  ].join("");
  return {
    reply: tr(M.emza.playerCreated, { name, parts }),
    data: { ...data, players: [...data.players, player] },
    href: `/players/?id=${player.id}`,
  };
}

function addTeam(text: string, data: ClubData): EmzaResult {
  const name = titleCaseAscii(
    extractAfter(text, [
      /تیم\s+(?:به نام\s+|با نام\s+|نام\s+)?([^،,.]+?)(?=[،,.]| (?:با|مربی|رده|سالن|ثبت|بساز)|$)/,
      new RegExp(`\\bteam\\s+(?:(?:named|called)\\s+)?([^،,.]+?)(?=[،,.]| (?:with|coach|age|venue|register|create|add|for)|$)`, "u"),
    ]),
  );
  if (!name) return { reply: tr(M.emza.teamNameNeeded) };
  if (data.teams.some((team) => normalizeFa(team.name) === normalizeFa(name))) {
    return { reply: tr(M.emza.teamExists, { name }) };
  }
  const coach = titleCaseAscii(
    extractAfter(text, [/مربی\s+([^،,.]+?)(?=[،,.]| (?:رده|سالن|رنگ)|$)/, /\bcoach(?:es)?\s+([^،,.]+?)(?=[،,.]| (?:age|venue|register|create|add|for)|$)/u])
      .replace(/\s*(?:ثبت کن|بساز|اضافه کن|ایجاد کن|register|create|add)$/u, "")
      .trim(),
  );
  const ageGroup = extractAfter(text, [
    /رده(?: سنی)?\s+([^،,.]+?)(?=[،,.]| (?:مربی|سالن)|$)/,
    /\bage(?: group| category)?\s*([^،,.]+?)(?=[،,.]| (?:coach|venue|register|create|add)|$)/u,
  ]);
  const venueStop = "(?=[،,.]| (?:ثبت|بساز|اضافه|ایجاد|رده|مربی|color|رنگ|register|create|add|for|age|coach)|$)";
  const venue = titleCaseAscii(
    extractAfter(text, [
      new RegExp(`سالن\\s+([^،,.]+?)${venueStop}`, "u"),
      new RegExp(`\\b(?:venue|hall)\\s+([^،,.]+?)${venueStop}`, "u"),
    ]),
  );
  const color: TeamColor = has(text, ["بنفش", "violet", "purple"])
    ? "violet"
    : has(text, ["سبز", "green", "emerald"])
      ? "emerald"
      : has(text, ["نارنجی", "orange", "amber"])
        ? "amber"
        : "blue";
  const team = {
    id: uid("team"),
    name,
    ageGroup,
    coach,
    color,
    season: data.club.season,
    homeVenue: venue,
  };
  return {
    reply: tr(M.emza.teamCreated, { name, parts: coach ? tr(M.emza.withCoach, { coach }) : "" }),
    data: { ...data, teams: [...data.teams, team] },
    href: `/teams/?id=${team.id}`,
  };
}

function addEvent(text: string, data: ClubData, now: Date): EmzaResult {
  const team = findTeam(data, text);
  if (!team && data.teams.length) {
    return { reply: tr(M.emza.askTeamEvent, { teams: teamNames(data) }) };
  }
  const type = has(text, KW.matchWord) ? "match" : "training";
  const date = resolveDate(text, now);
  extractTime(text, date);
  const opponent = titleCaseAscii(
    extractAfter(text, [
      /(?:حریف|با تیم)\s+([^،,.]+?)(?=[،,.]| (?:ساعت|فردا|امروز|سالن)|$)/,
      /(?:vs|against|with|team)\s+([^،,.]+?)(?=[،,.]| (?:at|on|tomorrow)|$)/u,
    ]),
  );
  const location =
    extractAfter(text, [
      /(?:در|سالن)\s+(سالن\s+[^،,.]+?)(?=[،,.]| (?:ساعت|فردا)|$)/,
      /\b(?:at|in)\s+(hall\s+[^،,.]+?)(?=[،,.]| (?:at|on|tomorrow)|$)/u,
    ]) || tr(M.eventForm.defaultVenue);
  const event = {
    id: uid("event"),
    type: type as "training" | "match",
    teamId: team?.id ?? "",
    title:
      type === "match"
        ? tr(M.emza.matchTitleFor, { opponent: opponent || tr(M.schedule.opponentWord) })
        : tr(M.emza.trainingTitleFor, { team: team?.name ?? tr(M.emza.clubWord) }),
    opponent: type === "match" ? opponent : undefined,
    location,
    startsAt: date.toISOString(),
    durationMin: 90,
    status: "scheduled" as const,
  };
  return {
    reply: tr(M.emza.eventSaved, {
      kind: type === "match" ? tr(M.emza.kindMatch) : tr(M.emza.kindTraining),
      date: faDate(date),
      time: formatTime(date),
    }),
    data: { ...data, events: [...data.events, event] },
    href: `/schedule/?id=${event.id}`,
  };
}

function markAttendance(text: string, data: ClubData): EmzaResult | null {
  const player = findPlayer(data, text);
  if (!player) return null;
  const status: "present" | "absent" | "late" | "excused" = has(text, ["غایب", "absent"])
    ? "absent"
    : has(text, ["موجه", "excused"])
      ? "excused"
      : has(text, ["تاخیر", "تأخیر", "late"])
        ? "late"
        : "present";
  const events = upcomingEvents(data);
  const event =
    data.events
      .filter((row) => row.teamId === player.teamId)
      .sort((a, b) => Math.abs(+new Date(a.startsAt) - Date.now()) - Math.abs(+new Date(b.startsAt) - Date.now()))[0] ??
    events[0];
  if (!event) return { reply: tr(M.emza.attendanceNoEvent) };
  const labels = {
    present: tr(M.emza.attPresent),
    absent: tr(M.emza.attAbsent),
    late: tr(M.emza.attLate),
    excused: tr(M.emza.attExcused),
  };
  const existing = data.attendance.find(
    (row) => row.eventId === event.id && row.playerId === player.id,
  );
  const attendance = existing
    ? data.attendance.map((row) => (row.id === existing.id ? { ...row, status } : row))
    : [
        ...data.attendance,
        { id: uid("att"), eventId: event.id, playerId: player.id, status },
      ];
  return {
    reply: tr(M.emza.attendanceSaved, { player: player.fullName, event: event.title, status: labels[status] }),
    data: { ...data, attendance },
    href: `/schedule/?id=${event.id}`,
  };
}

function addPayment(text: string, data: ClubData, now: Date): EmzaResult {
  const player = findPlayer(data, text);
  if (!player) return { reply: tr(M.emza.playerNameUnclear) };
  const amount = extractAmount(text);
  if (!amount) return { reply: tr(M.emza.amountNeeded) };
  const invoice = data.invoices
    .filter((row) => row.playerId === player.id && invoiceRemaining(row, data) > 0)
    .sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt))[0];
  if (!invoice) {
    return { reply: tr(M.emza.noOpenInvoice, { name: player.fullName, amount: toman(amount) }) };
  }
  const method: PaymentMethod = has(text, ["نقد", "cash"])
    ? "cash"
    : has(text, ["انتقال", "transfer"])
      ? "transfer"
      : "card";
  const value = Math.min(amount, invoiceRemaining(invoice, data));
  const payment = {
    id: uid("pay"),
    invoiceId: invoice.id,
    playerId: player.id,
    amount: value,
    paidAt: now.toISOString(),
    method,
    accountId: defaultAccountId(data, method),
  };
  return {
    reply: tr(M.emza.paymentSaved, { amount: toman(value), name: player.fullName }),
    data: { ...data, payments: [...data.payments, payment] },
    href: `/players/?id=${player.id}`,
  };
}

function addInvoice(text: string, data: ClubData, now: Date): EmzaResult {
  const player = findPlayer(data, text);
  if (!player) return { reply: tr(M.emza.invoiceForWhom) };
  const amount = extractAmount(text) ?? player.monthlyFee;
  if (!amount) return { reply: tr(M.emza.invoiceAmountNeeded) };
  const due = new Date(now);
  due.setDate(due.getDate() + 7);
  const invoice = {
    id: uid("inv"),
    playerId: player.id,
    kind: "tuition" as const,
    period: formatMonthYear(now),
    title: tr(M.emza.invoiceTuitionTitle),
    amount,
    dueAt: due.toISOString(),
    issuedAt: now.toISOString(),
  };
  return {
    reply: tr(M.emza.invoiceIssued, { amount: toman(amount), name: player.fullName }),
    data: { ...data, invoices: [...data.invoices, invoice] },
    href: `/players/?id=${player.id}`,
  };
}

function addTransaction(text: string, data: ClubData, now: Date): EmzaResult {
  const kind: TransactionKind = has(text, ["هزینه", "expense", "cost"]) ? "expense" : "income";
  const amount = extractAmount(text);
  if (!amount) return { reply: tr(M.emza.txAmountNeeded) };
  const title =
    extractAfter(text, [
      /(?:بابت|برای)\s+([^،,.]+?)(?=[،,.]| (?:ثبت|از|نقد)|$)/,
      /\bfor\s+([^،,.]+?)(?=[،,.]| (?:register|add|cash|card|paid)|$)/u,
    ]) || (kind === "expense" ? tr(M.emza.clubExpense) : tr(M.emza.clubIncome));
  const method: LedgerMethod = has(text, ["نقد", "cash"])
    ? "cash"
    : has(text, ["چک", "cheque", "check"])
      ? "cheque"
      : "card";
  const category =
    data.categories.find((row) => row.kind === kind && !row.system) ??
    data.categories.find((row) => row.kind === kind);
  if (!category) return { reply: tr(M.emza.noCategory) };
  const entry = {
    id: uid("ledger"),
    kind,
    categoryId: category.id,
    accountId: defaultAccountId(data, method),
    amount,
    method,
    date: now.toISOString(),
    title,
    source: "manual" as const,
    createdAt: now.toISOString(),
  };
  return {
    reply: tr(M.emza.txSaved, {
      kind: kind === "expense" ? tr(M.emza.txExpense) : tr(M.emza.txIncome),
      amount: toman(amount),
      title,
    }),
    data: { ...data, transactions: [...data.transactions, entry] },
    href: "/finances/ledger/",
  };
}
