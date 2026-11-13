import { daysFromNow, formatMonthYear, jalaliYear, previousJalaliMonth } from "./date";
import { M, tr, type Message } from "./i18n/messages";
import type {
  AppUser,
  Attendance,
  AttendanceStatus,
  BankAccount,
  ClubData,
  ClubEvent,
  ClubProfile,
  FinanceCategory,
  Invoice,
  LedgerEntry,
  MatchStat,
  Payment,
  Player,
  Product,
  SetScore,
  StockMovement,
  Team,
} from "./types";

const clubTeams: Team[] = [
  {
    id: "t-senior",
    name: "بزرگسالان",
    ageGroup: "لیگ برتر",
    coach: "امیر رضایی",
    color: "emerald",
    season: "۱۴۰۵",
    homeVenue: "سالن خانه والیبال",
  },
  {
    id: "t-u19",
    name: "جوانان",
    ageGroup: "زیر ۱۹ سال",
    coach: "حمید نوروزی",
    color: "blue",
    season: "۱۴۰۵",
    homeVenue: "سالن شماره ۲ باشگاه",
  },
  {
    id: "t-u16",
    name: "نوجوانان",
    ageGroup: "زیر ۱۶ سال",
    coach: "سعید رستمی",
    color: "amber",
    season: "۱۴۰۵",
    homeVenue: "سالن شماره ۱ باشگاه",
  },
];

const seniorFee = 2_800_000;
const u19Fee = 2_200_000;
const u16Fee = 1_800_000;

const clubPlayers: Player[] = [
  {
    id: "p1",
    fullName: "علی کریمی",
    phone: "0912 341 8820",
    teamId: "t-senior",
    position: "setter",
    jersey: 7,
    birthDate: "2001-04-12",
    heightCm: 190,
    status: "active",
    joinedAt: "2023-08-01",
    monthlyFee: seniorFee,
    note: "کاپیتان تیم",
  },
  {
    id: "p2",
    fullName: "محمد امینی",
    phone: "0912 553 1180",
    teamId: "t-senior",
    position: "outside",
    jersey: 11,
    birthDate: "2000-09-03",
    heightCm: 196,
    status: "active",
    joinedAt: "2022-09-12",
    monthlyFee: seniorFee,
  },
  {
    id: "p3",
    fullName: "رضا شریفی",
    phone: "0919 220 4471",
    teamId: "t-senior",
    position: "middle",
    jersey: 4,
    birthDate: "2002-01-22",
    heightCm: 201,
    status: "active",
    joinedAt: "2023-07-19",
    monthlyFee: seniorFee,
  },
  {
    id: "p4",
    fullName: "پارسا نادری",
    phone: "0935 811 2094",
    teamId: "t-senior",
    position: "opposite",
    jersey: 9,
    birthDate: "2001-11-08",
    heightCm: 198,
    status: "active",
    joinedAt: "2022-08-30",
    monthlyFee: seniorFee,
  },
  {
    id: "p5",
    fullName: "آرمان قاسمی",
    phone: "0901 447 6623",
    teamId: "t-senior",
    position: "libero",
    jersey: 18,
    birthDate: "2003-03-15",
    heightCm: 178,
    status: "active",
    joinedAt: "2023-09-02",
    monthlyFee: seniorFee,
  },
  {
    id: "p6",
    fullName: "سینا مرادی",
    phone: "0913 902 7745",
    teamId: "t-senior",
    position: "outside",
    jersey: 12,
    birthDate: "2002-06-27",
    heightCm: 193,
    status: "active",
    joinedAt: "2024-01-10",
    monthlyFee: seniorFee,
  },
  {
    id: "p7",
    fullName: "امیرحسین توکلی",
    phone: "0921 330 5518",
    teamId: "t-senior",
    position: "middle",
    jersey: 5,
    birthDate: "2000-12-19",
    heightCm: 203,
    status: "active",
    joinedAt: "2021-10-05",
    monthlyFee: seniorFee,
  },
  {
    id: "p8",
    fullName: "کیان احمدی",
    phone: "0902 118 3390",
    teamId: "t-senior",
    position: "setter",
    jersey: 2,
    birthDate: "2003-07-04",
    heightCm: 186,
    status: "injured",
    joinedAt: "2024-02-17",
    monthlyFee: seniorFee,
    note: "در حال فیزیوتراپی مچ پا",
  },
  {
    id: "p9",
    fullName: "مهدی رضایی",
    phone: "0937 660 2214",
    teamId: "t-senior",
    position: "outside",
    jersey: 14,
    birthDate: "2002-10-11",
    heightCm: 191,
    status: "active",
    joinedAt: "2023-11-23",
    monthlyFee: seniorFee,
  },
  {
    id: "p10",
    fullName: "حسین صادقی",
    phone: "0910 224 7781",
    teamId: "t-u19",
    position: "setter",
    jersey: 6,
    birthDate: "2007-05-09",
    heightCm: 184,
    status: "active",
    joinedAt: "2024-08-11",
    monthlyFee: u19Fee,
  },
  {
    id: "p11",
    fullName: "طاها موسوی",
    phone: "0938 109 5520",
    teamId: "t-u19",
    position: "outside",
    jersey: 10,
    birthDate: "2007-02-18",
    heightCm: 188,
    status: "active",
    joinedAt: "2024-08-11",
    monthlyFee: u19Fee,
  },
  {
    id: "p12",
    fullName: "یاسین رحیمی",
    phone: "0914 777 3320",
    teamId: "t-u19",
    position: "middle",
    jersey: 3,
    birthDate: "2008-01-30",
    heightCm: 195,
    status: "active",
    joinedAt: "2024-09-01",
    monthlyFee: u19Fee,
  },
  {
    id: "p13",
    fullName: "آرش نیک‌پور",
    phone: "0903 552 1187",
    teamId: "t-u19",
    position: "libero",
    jersey: 16,
    birthDate: "2007-09-25",
    heightCm: 175,
    status: "active",
    joinedAt: "2024-08-20",
    monthlyFee: u19Fee,
  },
  {
    id: "p14",
    fullName: "بهرام کیانی",
    phone: "0922 456 8890",
    teamId: "t-u19",
    position: "opposite",
    jersey: 8,
    birthDate: "2008-04-06",
    heightCm: 192,
    status: "active",
    joinedAt: "2024-10-03",
    monthlyFee: u19Fee,
  },
  {
    id: "p15",
    fullName: "دانیال فرهادی",
    phone: "0911 890 4432",
    teamId: "t-u19",
    position: "outside",
    jersey: 15,
    birthDate: "2007-12-12",
    heightCm: 187,
    status: "active",
    joinedAt: "2024-08-11",
    monthlyFee: u19Fee,
  },
  {
    id: "p16",
    fullName: "سامان حیدری",
    phone: "0930 215 6674",
    teamId: "t-u19",
    position: "middle",
    jersey: 1,
    birthDate: "2008-08-21",
    heightCm: 198,
    status: "active",
    joinedAt: "2025-01-14",
    monthlyFee: u19Fee,
  },
  {
    id: "p17",
    fullName: "امیر کاظمی",
    phone: "0905 663 1108",
    teamId: "t-u19",
    position: "setter",
    jersey: 13,
    birthDate: "2008-03-02",
    heightCm: 181,
    status: "active",
    joinedAt: "2025-02-08",
    monthlyFee: u19Fee,
  },
  {
    id: "p18",
    fullName: "نیما اسدی",
    phone: "0933 447 9901",
    teamId: "t-u16",
    position: "setter",
    jersey: 4,
    birthDate: "2010-05-14",
    heightCm: 175,
    status: "active",
    joinedAt: "2025-08-02",
    monthlyFee: u16Fee,
  },
  {
    id: "p19",
    fullName: "بردیا سلطانی",
    phone: "0919 887 2245",
    teamId: "t-u16",
    position: "outside",
    jersey: 7,
    birthDate: "2010-10-08",
    heightCm: 180,
    status: "active",
    joinedAt: "2025-08-02",
    monthlyFee: u16Fee,
  },
  {
    id: "p20",
    fullName: "پویا اکبری",
    phone: "0901 332 7789",
    teamId: "t-u16",
    position: "libero",
    jersey: 20,
    birthDate: "2011-02-27",
    heightCm: 168,
    status: "active",
    joinedAt: "2025-08-19",
    monthlyFee: u16Fee,
  },
  {
    id: "p21",
    fullName: "فرزین دهقان",
    phone: "0921 556 3320",
    teamId: "t-u16",
    position: "middle",
    jersey: 9,
    birthDate: "2010-07-30",
    heightCm: 188,
    status: "active",
    joinedAt: "2025-08-02",
    monthlyFee: u16Fee,
  },
  {
    id: "p22",
    fullName: "ماهان زارعی",
    phone: "0936 220 8845",
    teamId: "t-u16",
    position: "opposite",
    jersey: 11,
    birthDate: "2011-01-17",
    heightCm: 181,
    status: "active",
    joinedAt: "2025-09-06",
    monthlyFee: u16Fee,
  },
  {
    id: "p23",
    fullName: "شایان بهرامی",
    phone: "0912 908 4431",
    teamId: "t-u16",
    position: "outside",
    jersey: 6,
    birthDate: "2010-11-23",
    heightCm: 179,
    status: "active",
    joinedAt: "2025-08-02",
    monthlyFee: u16Fee,
  },
  {
    id: "p24",
    fullName: "آرمین عبدی",
    phone: "0902 771 6620",
    teamId: "t-u16",
    position: "middle",
    jersey: 17,
    birthDate: "2010-03-09",
    heightCm: 185,
    status: "inactive",
    joinedAt: "2025-08-02",
    monthlyFee: u16Fee,
    note: "انتقال به باشگاه دیگر",
  },
];

const clubUsers: AppUser[] = [
  {
    id: "u-manager",
    name: "سارا محمدی",
    email: "manager@setaregan.ir",
    role: "manager",
    status: "active",
    createdAt: "2023-08-01T09:00:00.000Z",
  },
  {
    id: "u-coach",
    name: "امیر رضایی",
    email: "coach@setaregan.ir",
    role: "coach",
    status: "active",
    teamId: "t-senior",
    createdAt: "2023-08-02T09:00:00.000Z",
  },
  {
    id: "u-player",
    name: "علی کریمی",
    email: "ali@setaregan.ir",
    role: "player",
    status: "active",
    teamId: "t-senior",
    playerId: "p1",
    createdAt: "2023-08-03T09:00:00.000Z",
  },
  {
    id: "u-coach-pending",
    name: "نگار حسینی",
    email: "negar@setaregan.ir",
    role: "coach",
    status: "pending",
    requestNote: "درخواست همکاری به‌عنوان مربی بدنسازی با سابقه ۶ سال کار با تیم‌های جوانان.",
    createdAt: daysFromNow(-2, 10),
  },
];

// Used to tell the sample club apart from a club a real manager created on this device.
export const DEMO_ACCOUNT_IDS = clubUsers.map((user) => user.id);

interface EventSeed {
  id: string;
  type: "training" | "match";
  teamId: string;
  title: string;
  opponent?: string;
  location: string;
  days: number;
  hour: number;
  minute?: number;
  durationMin: number;
  status: "scheduled" | "done";
  sets?: SetScore[];
  notes?: string;
}

const eventSeeds: EventSeed[] = [
  {
    id: "e-u19-training-prev",
    type: "training",
    teamId: "t-u19",
    title: "تمرین تیمی جوانان",
    location: "سالن شماره ۲ باشگاه",
    days: -7,
    hour: 17,
    durationMin: 120,
    status: "done",
  },
  {
    id: "e-senior-match-prev",
    type: "match",
    teamId: "t-senior",
    title: "مسابقه هفته سوم لیگ",
    opponent: "شهرداری ورامین",
    location: "سالن خانه والیبال",
    days: -3,
    hour: 18,
    durationMin: 150,
    status: "done",
    sets: [
      { home: 25, away: 22 },
      { home: 23, away: 25 },
      { home: 25, away: 18 },
      { home: 25, away: 20 },
    ],
    notes: "بازی خانگی، حضور تماشاگران آزاد",
  },
  {
    id: "e-u19-match-prev",
    type: "match",
    teamId: "t-u19",
    title: "مسابقه هفته دوم لیگ جوانان",
    opponent: "فولاد خوزستان",
    location: "سالن شماره ۲ باشگاه",
    days: -9,
    hour: 16,
    durationMin: 145,
    status: "done",
    sets: [
      { home: 25, away: 21 },
      { home: 22, away: 25 },
      { home: 25, away: 23 },
      { home: 20, away: 25 },
      { home: 15, away: 12 },
    ],
  },
  {
    id: "e-senior-training-1",
    type: "training",
    teamId: "t-senior",
    title: "تمرین بدنسازی و کار با توپ",
    location: "سالن خانه والیبال",
    days: -5,
    hour: 18,
    minute: 30,
    durationMin: 120,
    status: "done",
  },
  {
    id: "e-u19-training-1",
    type: "training",
    teamId: "t-u19",
    title: "تمرین تکنیک فردی",
    location: "سالن شماره ۲ باشگاه",
    days: -4,
    hour: 17,
    durationMin: 105,
    status: "done",
  },
  {
    id: "e-u16-training-1",
    type: "training",
    teamId: "t-u16",
    title: "تمرین پایه و دریافت",
    location: "سالن شماره ۱ باشگاه",
    days: -2,
    hour: 16,
    minute: 30,
    durationMin: 90,
    status: "done",
  },
  {
    id: "e-senior-training-2",
    type: "training",
    teamId: "t-senior",
    title: "تمرین تاکتیک حمله",
    location: "سالن خانه والیبال",
    days: -1,
    hour: 18,
    minute: 30,
    durationMin: 120,
    status: "done",
  },
  {
    id: "e-senior-training-next",
    type: "training",
    teamId: "t-senior",
    title: "تمرین تیمی و سرویس",
    location: "سالن خانه والیبال",
    days: 1,
    hour: 18,
    minute: 30,
    durationMin: 120,
    status: "scheduled",
    notes: "همراه داشتن زانو‌بند الزامی است",
  },
  {
    id: "e-u19-training-next",
    type: "training",
    teamId: "t-u19",
    title: "تمرین دفاع و پوشش",
    location: "سالن شماره ۲ باشگاه",
    days: 2,
    hour: 17,
    durationMin: 105,
    status: "scheduled",
  },
  {
    id: "e-u16-training-next",
    type: "training",
    teamId: "t-u16",
    title: "تمرین پاس و حرکت پایه",
    location: "سالن شماره ۱ باشگاه",
    days: 2,
    hour: 16,
    durationMin: 90,
    status: "scheduled",
  },
  {
    id: "e-senior-match-next",
    type: "match",
    teamId: "t-senior",
    title: "مسابقه هفته چهارم لیگ",
    opponent: "پیکان تهران",
    location: "سالن خانه والیبال",
    days: 3,
    hour: 18,
    durationMin: 150,
    status: "scheduled",
    notes: "بازی خانگی",
  },
  {
    id: "e-senior-training-3",
    type: "training",
    teamId: "t-senior",
    title: "تمرین مرور تاکتیک مسابقه",
    location: "سالن خانه والیبال",
    days: 4,
    hour: 18,
    minute: 30,
    durationMin: 120,
    status: "scheduled",
  },
  {
    id: "e-u19-match-next",
    type: "match",
    teamId: "t-u19",
    title: "مسابقه هفته سوم لیگ جوانان",
    opponent: "سایپا تهران",
    location: "سالن شماره ۲ باشگاه",
    days: 5,
    hour: 17,
    durationMin: 150,
    status: "scheduled",
  },
  {
    id: "e-u16-training-2",
    type: "training",
    teamId: "t-u16",
    title: "تمرین سرویس و اسپک",
    location: "سالن شماره ۱ باشگاه",
    days: 6,
    hour: 16,
    durationMin: 90,
    status: "scheduled",
  },
  {
    id: "e-senior-training-4",
    type: "training",
    teamId: "t-senior",
    title: "تمرین ریکاوری و کشش",
    location: "سالن خانه والیبال",
    days: 8,
    hour: 18,
    minute: 30,
    durationMin: 90,
    status: "scheduled",
  },
];

function buildEvents(): ClubEvent[] {
  return eventSeeds.map((seed) => ({
    id: seed.id,
    type: seed.type,
    teamId: seed.teamId,
    title: seed.title,
    opponent: seed.opponent,
    location: seed.location,
    startsAt: daysFromNow(seed.days, seed.hour, seed.minute ?? 0),
    durationMin: seed.durationMin,
    status: seed.status,
    notes: seed.notes,
    sets: seed.sets,
  }));
}

const attendanceCycle: AttendanceStatus[] = [
  "present",
  "late",
  "present",
  "absent",
  "present",
  "present",
  "excused",
  "present",
  "late",
  "present",
];

function attendanceStatus(playerIndex: number, eventIndex: number): AttendanceStatus {
  const slot = (playerIndex * 3 + eventIndex * 7 + 1) % attendanceCycle.length;
  return attendanceCycle[slot];
}

function buildAttendance(events: ClubEvent[]): Attendance[] {
  const records: Attendance[] = [];
  const trainings = events.filter((event) => event.type === "training" && event.status === "done");
  trainings.forEach((event, eventIndex) => {
    const roster = clubPlayers.filter(
      (player) => player.teamId === event.teamId && player.status !== "inactive",
    );
    roster.forEach((player, playerIndex) => {
      records.push({
        id: `att-${event.id}-${player.id}`,
        eventId: event.id,
        playerId: player.id,
        status: attendanceStatus(playerIndex, eventIndex),
      });
    });
  });
  return records;
}

const seniorStats: Array<[string, number, number, number, number, number]> = [
  ["p1", 4, 2, 1, 8, 2],
  ["p2", 2, 14, 2, 6, 5],
  ["p3", 1, 4, 5, 2, 1],
  ["p4", 3, 12, 1, 5, 4],
  ["p5", 0, 0, 0, 16, 0],
  ["p6", 1, 8, 1, 3, 2],
  ["p7", 0, 3, 4, 1, 1],
  ["p9", 0, 2, 0, 1, 1],
];

const u19Stats: Array<[string, number, number, number, number, number]> = [
  ["p10", 3, 1, 0, 7, 2],
  ["p11", 2, 13, 1, 4, 4],
  ["p12", 1, 5, 6, 2, 2],
  ["p13", 0, 0, 0, 14, 1],
  ["p14", 2, 9, 2, 3, 3],
  ["p15", 1, 7, 1, 2, 2],
  ["p16", 0, 2, 3, 1, 1],
  ["p17", 0, 1, 0, 2, 0],
];

function buildStats(): MatchStat[] {
  const rows: MatchStat[] = [];
  const add = (eventId: string, entries: Array<[string, number, number, number, number, number]>) => {
    entries.forEach(([playerId, servePoints, attackPoints, blockPoints, digs, errors]) => {
      rows.push({
        id: `stat-${eventId}-${playerId}`,
        eventId,
        playerId,
        servePoints,
        attackPoints,
        blockPoints,
        digs,
        errors,
      });
    });
  };
  add("e-senior-match-prev", seniorStats);
  add("e-u19-match-prev", u19Stats);
  return rows;
}

function buildFinances(): { invoices: Invoice[]; payments: Payment[] } {
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];

  const now = new Date();
  const currentPeriod = formatMonthYear(now);
  const previousPeriod = formatMonthYear(previousJalaliMonth(now));

  const unpaidPrevious = new Set(["p11", "p20"]);
  const unpaidCurrent = new Set(["p3", "p9", "p15", "p19", "p23"]);
  const partialCurrent = new Set(["p2", "p13", "p22"]);
  const methods: Payment["method"][] = ["card", "gateway", "cash"];

  clubPlayers.forEach((player, index) => {
    const previousInvoiceId = `inv-prev-${player.id}`;
    invoices.push({
      id: previousInvoiceId,
      playerId: player.id,
      kind: "tuition",
      period: previousPeriod,
      title: `شهریه ${previousPeriod}`,
      amount: player.monthlyFee,
      dueAt: daysFromNow(-21, 12),
      issuedAt: daysFromNow(-33, 10),
    });
    if (!unpaidPrevious.has(player.id)) {
      const previousMethod = methods[index % methods.length];
      payments.push({
        id: `pay-prev-${player.id}`,
        invoiceId: previousInvoiceId,
        playerId: player.id,
        amount: player.monthlyFee,
        paidAt: daysFromNow(-30 + (index % 6), 11),
        method: previousMethod,
        accountId: previousMethod === "cash" ? "acc-cash" : "acc-bank",
        reference: `TRX-${1400 + index}`,
      });
    }

    if (player.status === "inactive") return;

    const currentInvoiceId = `inv-cur-${player.id}`;
    invoices.push({
      id: currentInvoiceId,
      playerId: player.id,
      kind: "tuition",
      period: currentPeriod,
      title: `شهریه ${currentPeriod}`,
      amount: player.monthlyFee,
      dueAt: daysFromNow(9, 12),
      issuedAt: daysFromNow(-2, 10),
    });

    if (!unpaidCurrent.has(player.id)) {
      const partial = partialCurrent.has(player.id);
      const currentMethod = methods[(index + 1) % methods.length];
      payments.push({
        id: `pay-cur-${player.id}`,
        invoiceId: currentInvoiceId,
        playerId: player.id,
        amount: partial ? Math.round(player.monthlyFee / 2) : player.monthlyFee,
        paidAt: daysFromNow(-1 - (index % 5), 13),
        method: currentMethod,
        accountId: currentMethod === "cash" ? "acc-cash" : "acc-bank",
        reference: `TRX-${2100 + index}`,
      });
    }
  });

  return { invoices, payments };
}

export const DEFAULT_FINANCE_CATEGORIES: FinanceCategory[] = [
  { id: "cat-tuition", name: "شهریه بازیکنان", kind: "income", system: true },
  { id: "cat-sale-clothing", name: "فروش پوشاک ورزشی", kind: "income", system: true },
  { id: "cat-sale-equipment", name: "فروش تجهیزات ورزشی", kind: "income", system: true },
  { id: "cat-sale-other", name: "فروش سایر کالاها", kind: "income", system: true },
  { id: "cat-donation", name: "حمایت و اسپانسر", kind: "income" },
  { id: "cat-other-income", name: "سایر درآمدها", kind: "income" },
  { id: "cat-purchase-clothing", name: "خرید پوشاک ورزشی", kind: "expense", system: true },
  { id: "cat-purchase-equipment", name: "خرید تجهیزات ورزشی", kind: "expense", system: true },
  { id: "cat-purchase-other", name: "خرید سایر کالاها", kind: "expense", system: true },
  { id: "cat-rent", name: "اجاره سالن", kind: "expense" },
  { id: "cat-salary", name: "حقوق مربیان", kind: "expense" },
  { id: "cat-utilities", name: "آب، برق و گاز", kind: "expense" },
  { id: "cat-transport", name: "حمل و نقل", kind: "expense" },
  { id: "cat-other-expense", name: "سایر هزینه‌ها", kind: "expense" },
];

export const DEFAULT_ACCOUNTS: BankAccount[] = [
  {
    id: "acc-cash",
    name: "صندوق باشگاه",
    kind: "cash",
    openingBalance: 15_000_000,
    active: true,
  },
  {
    id: "acc-bank",
    name: "حساب جاری باشگاه",
    kind: "bank",
    bankName: "بانک ملت",
    accountNumber: "1234567890",
    cardNumber: "6104338811229900",
    iban: "IR120120000000001234567890",
    openingBalance: 60_000_000,
    active: true,
  },
];

const seedProducts: Product[] = [
  {
    id: "pr-jersey",
    name: "پیراهن تمرین ستارگان",
    category: "clothing",
    sku: "JER-01",
    size: "L",
    costPrice: 420_000,
    salePrice: 690_000,
    stock: 23,
    minStock: 6,
    active: true,
  },
  {
    id: "pr-knee",
    name: "زانوبند والیبال",
    category: "equipment",
    sku: "KNEE-02",
    size: "M",
    costPrice: 180_000,
    salePrice: 290_000,
    stock: 10,
    minStock: 4,
    active: true,
  },
  {
    id: "pr-ball",
    name: "توپ مسابقه والیبال",
    category: "equipment",
    sku: "BALL-05",
    size: "استاندارد",
    costPrice: 1_250_000,
    salePrice: 1_690_000,
    stock: 4,
    minStock: 3,
    active: true,
  },
];

function buildBusinessFinance(): {
  products: Product[];
  stockMovements: StockMovement[];
  transactions: LedgerEntry[];
} {
  const buyJerseyDate = daysFromNow(-42, 11);
  const buyKneeDate = daysFromNow(-36, 12);
  const buyBallDate = daysFromNow(-30, 10);
  const sellJerseyDate = daysFromNow(-12, 17);
  const sellKneeDate = daysFromNow(-8, 18);
  const sellBallDate = daysFromNow(-4, 12);
  const sellBallCreditDate = daysFromNow(-2, 10);
  const sellJerseyCreditDate = daysFromNow(-1, 11);

  const transactions: LedgerEntry[] = [
    {
      id: "txn-buy-jersey",
      kind: "expense",
      categoryId: "cat-purchase-clothing",
      accountId: "acc-bank",
      amount: 12_600_000,
      method: "card",
      date: buyJerseyDate,
      title: "خرید ۳۰ عدد پیراهن تمرین",
      party: "پوشاک ورزشی آریا",
      source: "purchase",
      refId: "mv-buy-jersey",
      createdAt: buyJerseyDate,
    },
    {
      id: "txn-buy-knee",
      kind: "expense",
      categoryId: "cat-purchase-equipment",
      accountId: "acc-cash",
      amount: 2_160_000,
      method: "cash",
      date: buyKneeDate,
      title: "خرید ۱۲ عدد زانوبند",
      party: "تجهیزات ورزشی پارس",
      source: "purchase",
      refId: "mv-buy-knee",
      createdAt: buyKneeDate,
    },
    {
      id: "txn-buy-ball",
      kind: "expense",
      categoryId: "cat-purchase-equipment",
      accountId: "acc-bank",
      amount: 7_500_000,
      method: "transfer",
      date: buyBallDate,
      title: "خرید ۶ عدد توپ مسابقه",
      party: "شرکت توپ‌سازی اسپرت",
      source: "purchase",
      refId: "mv-buy-ball",
      createdAt: buyBallDate,
    },
    {
      id: "txn-sell-jersey",
      kind: "income",
      categoryId: "cat-sale-clothing",
      accountId: "acc-cash",
      amount: 4_140_000,
      method: "cash",
      date: sellJerseyDate,
      title: "فروش ۶ عدد پیراهن تمرین",
      party: "علی کریمی",
      playerId: "p1",
      source: "sale",
      refId: "mv-sell-jersey",
      createdAt: sellJerseyDate,
    },
    {
      id: "txn-sell-knee",
      kind: "income",
      categoryId: "cat-sale-equipment",
      accountId: "acc-bank",
      amount: 580_000,
      method: "card",
      date: sellKneeDate,
      title: "فروش ۲ عدد زانوبند",
      party: "مهدی رضایی",
      playerId: "p9",
      source: "sale",
      refId: "mv-sell-knee",
      createdAt: sellKneeDate,
    },
    {
      id: "txn-sell-ball",
      kind: "income",
      categoryId: "cat-sale-equipment",
      accountId: "acc-bank",
      amount: 3_380_000,
      method: "cheque",
      date: sellBallDate,
      title: "فروش ۲ عدد توپ مسابقه",
      party: "باشگاه پیکان",
      source: "sale",
      refId: "mv-sell-ball",
      cheque: {
        number: "۴۵۸۹۲۱",
        bank: "بانک پاسارگاد",
        dueAt: daysFromNow(14, 12),
        status: "pending",
      },
      createdAt: sellBallDate,
    },
    {
      id: "txn-sell-ball-credit",
      kind: "income",
      categoryId: "cat-sale-equipment",
      accountId: "",
      amount: 1_690_000,
      method: "credit",
      date: sellBallCreditDate,
      title: "فروش ۱ عدد توپ مسابقه",
      party: "آکادمی والیبال شهاب",
      source: "sale",
      refId: "mv-sell-ball-credit",
      credit: true,
      settled: false,
      createdAt: sellBallCreditDate,
    },
    {
      id: "txn-sell-jersey-credit",
      kind: "income",
      categoryId: "cat-sale-clothing",
      accountId: "",
      amount: 690_000,
      method: "credit",
      date: sellJerseyCreditDate,
      title: "فروش نسیه ۱ عدد پیراهن تمرین",
      party: "امیر کاظمی",
      playerId: "p17",
      source: "sale",
      refId: "mv-sell-jersey-credit",
      credit: true,
      settled: false,
      createdAt: sellJerseyCreditDate,
    },
    {
      id: "txn-rent",
      kind: "expense",
      categoryId: "cat-rent",
      accountId: "acc-bank",
      amount: 25_000_000,
      method: "transfer",
      date: daysFromNow(-25, 10),
      title: "اجاره ماهانه سالن",
      party: "مالک سالن",
      source: "manual",
      createdAt: daysFromNow(-25, 10),
    },
    {
      id: "txn-salary",
      kind: "expense",
      categoryId: "cat-salary",
      accountId: "acc-bank",
      amount: 42_000_000,
      method: "transfer",
      date: daysFromNow(-18, 9),
      title: "حقوق کادر فنی",
      party: "کادر فنی باشگاه",
      source: "manual",
      createdAt: daysFromNow(-18, 9),
    },
    {
      id: "txn-utilities",
      kind: "expense",
      categoryId: "cat-utilities",
      accountId: "acc-cash",
      amount: 4_800_000,
      method: "cash",
      date: daysFromNow(-10, 13),
      title: "قبوض آب، برق و گاز",
      source: "manual",
      createdAt: daysFromNow(-10, 13),
    },
    {
      id: "txn-transport",
      kind: "expense",
      categoryId: "cat-transport",
      accountId: "acc-cash",
      amount: 2_500_000,
      method: "cash",
      date: daysFromNow(-6, 16),
      title: "هزینه سرویس ایاب و ذهاب",
      party: "شرکت حمل و نقل",
      source: "manual",
      createdAt: daysFromNow(-6, 16),
    },
    {
      id: "txn-sponsor",
      kind: "income",
      categoryId: "cat-donation",
      accountId: "acc-bank",
      amount: 50_000_000,
      method: "transfer",
      date: daysFromNow(-22, 11),
      title: "حمایت مالی اسپانسر فصل",
      party: "شرکت لبنیات کوهسار",
      source: "manual",
      createdAt: daysFromNow(-22, 11),
    },
    {
      id: "txn-camp",
      kind: "income",
      categoryId: "cat-other-income",
      accountId: "acc-cash",
      amount: 8_500_000,
      method: "cash",
      date: daysFromNow(-15, 14),
      title: "درآمد کمپ تابستانی",
      party: "شرکت‌کنندگان کمپ",
      source: "manual",
      createdAt: daysFromNow(-15, 14),
    },
    {
      id: "txn-rent-cheque",
      kind: "expense",
      categoryId: "cat-rent",
      accountId: "acc-bank",
      amount: 10_000_000,
      method: "cheque",
      date: daysFromNow(-2, 12),
      title: "چک اجاره سالن",
      party: "مالک سالن",
      source: "manual",
      cheque: {
        number: "۸۴۹۲۰۱",
        bank: "بانک صادرات",
        dueAt: daysFromNow(5, 12),
        status: "pending",
      },
      createdAt: daysFromNow(-2, 12),
    },
  ];

  const stockMovements: StockMovement[] = [
    {
      id: "mv-buy-jersey",
      productId: "pr-jersey",
      kind: "purchase",
      qty: 30,
      unitPrice: 420_000,
      date: buyJerseyDate,
      party: "پوشاک ورزشی آریا",
      accountId: "acc-bank",
      method: "card",
      ledgerId: "txn-buy-jersey",
    },
    {
      id: "mv-buy-knee",
      productId: "pr-knee",
      kind: "purchase",
      qty: 12,
      unitPrice: 180_000,
      date: buyKneeDate,
      party: "تجهیزات ورزشی پارس",
      accountId: "acc-cash",
      method: "cash",
      ledgerId: "txn-buy-knee",
    },
    {
      id: "mv-buy-ball",
      productId: "pr-ball",
      kind: "purchase",
      qty: 6,
      unitPrice: 1_250_000,
      date: buyBallDate,
      party: "شرکت توپ‌سازی اسپرت",
      accountId: "acc-bank",
      method: "transfer",
      ledgerId: "txn-buy-ball",
    },
    {
      id: "mv-sell-jersey",
      productId: "pr-jersey",
      kind: "sale",
      qty: 6,
      unitPrice: 690_000,
      date: sellJerseyDate,
      party: "علی کریمی",
      accountId: "acc-cash",
      method: "cash",
      ledgerId: "txn-sell-jersey",
    },
    {
      id: "mv-sell-knee",
      productId: "pr-knee",
      kind: "sale",
      qty: 2,
      unitPrice: 290_000,
      date: sellKneeDate,
      party: "مهدی رضایی",
      accountId: "acc-bank",
      method: "card",
      ledgerId: "txn-sell-knee",
    },
    {
      id: "mv-sell-ball",
      productId: "pr-ball",
      kind: "sale",
      qty: 2,
      unitPrice: 1_690_000,
      date: sellBallDate,
      party: "باشگاه پیکان",
      accountId: "acc-bank",
      method: "cheque",
      cheque: {
        number: "۴۵۸۹۲۱",
        bank: "بانک پاسارگاد",
        dueAt: daysFromNow(14, 12),
        status: "pending",
      },
      ledgerId: "txn-sell-ball",
    },
    {
      id: "mv-sell-ball-credit",
      productId: "pr-ball",
      kind: "sale",
      qty: 1,
      unitPrice: 1_690_000,
      date: sellBallCreditDate,
      party: "آکادمی والیبال شهاب",
      method: "credit",
      ledgerId: "txn-sell-ball-credit",
    },
    {
      id: "mv-sell-jersey-credit",
      productId: "pr-jersey",
      kind: "sale",
      qty: 1,
      unitPrice: 690_000,
      date: sellJerseyCreditDate,
      party: "امیر کاظمی",
      method: "credit",
      ledgerId: "txn-sell-jersey-credit",
    },
  ];

  return { products: seedProducts, stockMovements, transactions };
}

export const DEFAULT_CLUB: ClubProfile = {
  name: "باشگاه ستارگان",
  shortName: "ستارگان",
  sport: "volleyball",
  city: "تهران",
  founded: "۱۳۹۴",
  phone: "021 8877 4412",
  season: "۱۴۰۵",
};

export const DEMO_DATA_VERSION = 13;

const sampleAddresses = [
  "تهران، خیابان ولیعصر، کوچه بهار، پلاک ۱۲",
  "تهران، میدان فلاح، خیابان ناهید، پلاک ۴۵",
  "تهران، جردن، خیابان لنگانی، پلاک ۸",
  "تهران، سعادت‌آباد، بلوار دریا، پلاک ۱۳۰",
  "تهران، تجریش، خیابان دزاشیب، پلاک ۲۱",
];

const sampleReminders = [
  "۱۵ دقیقه قبل از شروع در سالن حاضر باشید",
  "کفش تخصصی و زانوبند همراه داشته باشید",
  "سرویس رفت و برگشت از جلوی سالن حرکت می‌کند",
  "کارت بازی برای همه بازیکنان الزامی است",
];

/** Names the app writes into a club the manager has not named yet. */
const UNTITLED_CLUB_NAMES = new Set(["باشگاه من", "My Club"]);
const UNTITLED_CLUB_SHORTS = new Set(["باشگاه", "Club"]);

export function isUntitledClubName(value: string) {
  return UNTITLED_CLUB_NAMES.has(value.trim());
}

export function isUntitledClubShort(value: string) {
  return UNTITLED_CLUB_SHORTS.has(value.trim());
}

// A first run on a real device must not carry sample values such as the demo phone number or opening balances.
function createEmptyClub(): ClubProfile {
  return {
    name: tr(M.seed.untitledClub),
    shortName: tr(M.seed.untitledShort),
    sport: DEFAULT_CLUB.sport,
    city: "",
    founded: "",
    phone: "",
    season: jalaliYear(),
  };
}

const CATEGORY_SEED_NAMES: Record<string, Message> = {
  "cat-tuition": M.seed.catTuition,
  "cat-sale-clothing": M.seed.catSaleClothing,
  "cat-sale-equipment": M.seed.catSaleEquipment,
  "cat-sale-other": M.seed.catSaleOther,
  "cat-donation": M.seed.catDonation,
  "cat-other-income": M.seed.catOtherIncome,
  "cat-purchase-clothing": M.seed.catPurchaseClothing,
  "cat-purchase-equipment": M.seed.catPurchaseEquipment,
  "cat-purchase-other": M.seed.catPurchaseOther,
  "cat-rent": M.seed.catRent,
  "cat-salary": M.seed.catSalary,
  "cat-utilities": M.seed.catUtilities,
  "cat-transport": M.seed.catTransport,
  "cat-other-expense": M.seed.catOtherExpense,
};

/** The starter ledger, renamed into the language the club is being created in. */
function defaultCategories(): FinanceCategory[] {
  return DEFAULT_FINANCE_CATEGORIES.map((category) => {
    const message = CATEGORY_SEED_NAMES[category.id];
    return message ? { ...category, name: tr(message) } : { ...category };
  });
}

function defaultAccounts(): BankAccount[] {
  return [
    { id: "acc-cash", name: tr(M.seed.accountCash), kind: "cash", openingBalance: 0, active: true },
    { id: "acc-bank", name: tr(M.seed.accountBank), kind: "bank", openingBalance: 0, active: true },
  ];
}

export function createEmptyData(): ClubData {
  return {
    club: createEmptyClub(),
    teams: [],
    players: [],
    events: [],
    attendance: [],
    stats: [],
    invoices: [],
    payments: [],
    users: [],
    categories: defaultCategories(),
    accounts: defaultAccounts(),
    transactions: [],
    products: [],
    stockMovements: [],
  };
}

export function createSeedData(): ClubData {
  const events = buildEvents();
  const { invoices, payments } = buildFinances();
  const business = buildBusinessFinance();

  return {
    club: { ...DEFAULT_CLUB },
    teams: clubTeams,
    players: clubPlayers.map((player, index) => ({
      ...player,
      insured: index % 4 !== 3,
      address: sampleAddresses[index % sampleAddresses.length],
    })),
    events: events.map((event, index) =>
      event.status === "scheduled"
        ? { ...event, reminderNote: sampleReminders[index % sampleReminders.length] }
        : event,
    ),
    attendance: buildAttendance(events),
    stats: buildStats(),
    invoices,
    payments,
    users: clubUsers,
    categories: DEFAULT_FINANCE_CATEGORIES,
    accounts: DEFAULT_ACCOUNTS,
    transactions: business.transactions,
    products: business.products,
    stockMovements: business.stockMovements,
  };
}
