import { bi, bilingual } from "./i18n/bilingual";
import type {
  AccountKind,
  AttendanceStatus,
  ChequeStatus,
  EventStatus,
  InvoiceKind,
  LedgerMethod,
  PaymentMethod,
  PlayerStatus,
  Position,
  ProductCategory,
  Role,
  Sport,
  StockMovementKind,
  TeamColor,
  TransactionKind,
  TransactionSource,
  UserStatus,
} from "./types";

export const SPORT_LABELS: Record<Sport, string> = bilingual({
  volleyball: bi("والیبال", "Volleyball"),
  basketball: bi("بسکتبال", "Basketball"),
  football: bi("فوتبال", "Football"),
});

export const SPORT_ORDER: Sport[] = ["volleyball", "basketball", "football"];

export const POSITION_LABELS: Record<Position, string> = bilingual({
  setter: bi("پاسور", "Setter"),
  outside: bi("مهاجم قدرتی", "Outside hitter"),
  middle: bi("دفاع وسط", "Middle blocker"),
  opposite: bi("اوپوزیت", "Opposite"),
  libero: bi("لیبرو", "Libero"),
  "point-guard": bi("پوینت گارد", "Point guard"),
  "shooting-guard": bi("شوتینگ گارد", "Shooting guard"),
  "small-forward": bi("اسمال فوروارد", "Small forward"),
  "power-forward": bi("پاور فوروارد", "Power forward"),
  center: bi("سنتر", "Center"),
  goalkeeper: bi("دروازه‌بان", "Goalkeeper"),
  defender: bi("مدافع", "Defender"),
  midfielder: bi("هافبک", "Midfielder"),
  forward: bi("مهاجم", "Forward"),
  training: bi("آموزشی (بدون پست)", "Development (no position)"),
});

export const SPORT_POSITIONS: Record<Sport, Position[]> = {
  volleyball: ["setter", "outside", "middle", "opposite", "libero", "training"],
  basketball: ["point-guard", "shooting-guard", "small-forward", "power-forward", "center", "training"],
  football: ["goalkeeper", "defender", "midfielder", "forward", "training"],
};

const POSITION_MAP: Record<Sport, Partial<Record<Position, Position>>> = {
  volleyball: {
    "point-guard": "setter",
    "shooting-guard": "outside",
    "small-forward": "outside",
    "power-forward": "middle",
    center: "middle",
    goalkeeper: "libero",
    defender: "middle",
    midfielder: "setter",
    forward: "outside",
  },
  basketball: {
    setter: "point-guard",
    outside: "shooting-guard",
    middle: "power-forward",
    opposite: "small-forward",
    libero: "center",
    goalkeeper: "center",
    defender: "power-forward",
    midfielder: "point-guard",
    forward: "shooting-guard",
  },
  football: {
    setter: "midfielder",
    outside: "forward",
    middle: "defender",
    opposite: "forward",
    libero: "goalkeeper",
    "point-guard": "midfielder",
    "shooting-guard": "forward",
    "small-forward": "forward",
    "power-forward": "defender",
    center: "defender",
  },
};

export function remapPosition(position: Position, sport: Sport): Position {
  if (position === "training") return "training";
  return POSITION_MAP[sport][position] ?? SPORT_POSITIONS[sport][0];
}

export const PERIOD_LABELS: Record<Sport, string> = bilingual({
  volleyball: bi("ست", "Set"),
  basketball: bi("کوارتر", "Quarter"),
  football: bi("نیمه", "Half"),
});

export const PERIOD_COUNT: Record<Sport, number> = {
  volleyball: 5,
  basketball: 4,
  football: 2,
};

export interface StatLabels {
  serve: string;
  attack: string;
  block: string;
  digs: string;
  errors: string;
  total: string;
  summary: string;
}

export const STAT_LABELS: Record<Sport, StatLabels> = {
  volleyball: bilingual({
    serve: bi("سرویس", "Serve"),
    attack: bi("حمله", "Attack"),
    block: bi("دفاع", "Block"),
    digs: bi("رویش", "Dig"),
    errors: bi("خطا", "Error"),
    total: bi("امتیاز", "Points"),
    summary: bi("امتیازهای سرویس، حمله و دفاع", "Serve, attack and block points"),
  }),
  basketball: bilingual({
    serve: bi("پنالتی", "Free throws"),
    attack: bi("میدانی", "Field goals"),
    block: bi("بلاک", "Blocks"),
    digs: bi("ریباند", "Rebounds"),
    errors: bi("خطا", "Turnovers"),
    total: bi("امتیاز", "Points"),
    summary: bi("امتیازهای پنالتی، میدانی و بلاک", "Free throw, field goal and block points"),
  }),
  football: bilingual({
    serve: bi("گل", "Goals"),
    attack: bi("پاس گل", "Assists"),
    block: bi("دفاع", "Defence"),
    digs: bi("تکل", "Tackles"),
    errors: bi("خطا", "Errors"),
    total: bi("اثرگذاری", "Impact"),
    summary: bi("گل‌ها، پاس گل‌ها و دفاع", "Goals, assists and defence"),
  }),
};

export const PLAYER_STATUS_LABELS: Record<PlayerStatus, string> = bilingual({
  active: bi("فعال", "Active"),
  injured: bi("مصدوم", "Injured"),
  inactive: bi("غیرفعال", "Inactive"),
});

export const EVENT_TYPE_LABELS: Record<"training" | "match", string> = bilingual({
  training: bi("تمرین", "Training"),
  match: bi("مسابقه", "Match"),
});

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = bilingual({
  scheduled: bi("برنامه‌ریزی‌شده", "Scheduled"),
  done: bi("برگزارشده", "Played"),
  canceled: bi("لغوشده", "Canceled"),
});

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = bilingual({
  present: bi("حاضر", "Present"),
  late: bi("تأخیر", "Late"),
  absent: bi("غایب", "Absent"),
  excused: bi("موجه", "Excused"),
});

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = bilingual({
  card: bi("کارت به کارت", "Card to card"),
  cash: bi("نقدی", "Cash"),
  gateway: bi("درگاه پرداخت", "Payment gateway"),
  transfer: bi("انتقال بانکی", "Bank transfer"),
});

export const LEDGER_METHOD_LABELS: Record<LedgerMethod, string> = bilingual({
  cash: bi("نقدی", "Cash"),
  card: bi("کارت به کارت", "Card to card"),
  cheque: bi("چک", "Cheque"),
  transfer: bi("انتقال بانکی", "Bank transfer"),
  credit: bi("نسیه", "On credit"),
});

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = bilingual({
  income: bi("درآمد", "Income"),
  expense: bi("هزینه", "Expense"),
});

export const TRANSACTION_SOURCE_LABELS: Record<TransactionSource, string> = bilingual({
  manual: bi("ثبت دستی", "Manual entry"),
  tuition: bi("شهریه", "Tuition"),
  sale: bi("فروش کالا", "Product sale"),
  purchase: bi("خرید کالا", "Product purchase"),
});

export const CHEQUE_STATUS_LABELS: Record<ChequeStatus, string> = bilingual({
  pending: bi("در جریان", "Pending"),
  cleared: bi("پاس‌شده", "Cleared"),
  bounced: bi("برگشتی", "Bounced"),
});

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = bilingual({
  cash: bi("صندوق نقدی", "Cash box"),
  bank: bi("حساب بانکی", "Bank account"),
});

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = bilingual({
  clothing: bi("پوشاک ورزشی", "Sportswear"),
  equipment: bi("تجهیزات ورزشی", "Equipment"),
  other: bi("سایر کالاها", "Other"),
});

export const STOCK_MOVEMENT_LABELS: Record<StockMovementKind, string> = bilingual({
  purchase: bi("خرید", "Purchase"),
  sale: bi("فروش", "Sale"),
  adjustment: bi("اصلاح موجودی", "Stock adjustment"),
});

export const USER_STATUS_LABELS: Record<UserStatus, string> = bilingual({
  active: bi("فعال", "Active"),
  pending: bi("در انتظار تأیید", "Awaiting approval"),
  rejected: bi("ردشده", "Rejected"),
});

export const INVOICE_KIND_LABELS: Record<InvoiceKind, string> = bilingual({
  tuition: bi("شهریه", "Tuition"),
  tax: bi("مالیات", "Tax"),
});

export const ROLE_LABELS: Record<Role, string> = bilingual({
  manager: bi("مدیر باشگاه", "Club manager"),
  coach: bi("مربی", "Coach"),
  player: bi("بازیکن", "Player"),
});

export const TEAM_COLOR_LABELS: Record<TeamColor, string> = bilingual({
  blue: bi("آبی", "Blue"),
  amber: bi("کهربایی", "Amber"),
  emerald: bi("زمردی", "Emerald"),
  violet: bi("بنفش", "Violet"),
});

export const TEAM_THEME: Record<
  TeamColor,
  { chip: string; dot: string; soft: string; text: string; gradient: string; ring: string }
> = {
  blue: {
    chip: "bg-blue-50 text-blue-700 ring-blue-200/70",
    dot: "bg-blue-500",
    soft: "bg-blue-50",
    text: "text-blue-700",
    gradient: "from-blue-600 via-blue-700 to-indigo-800",
    ring: "ring-blue-200",
  },
  amber: {
    chip: "bg-amber-50 text-amber-700 ring-amber-200/70",
    dot: "bg-amber-500",
    soft: "bg-amber-50",
    text: "text-amber-700",
    gradient: "from-amber-500 via-orange-600 to-rose-600",
    ring: "ring-amber-200",
  },
  emerald: {
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
    dot: "bg-emerald-500",
    soft: "bg-emerald-50",
    text: "text-emerald-700",
    gradient: "from-emerald-500 via-teal-600 to-cyan-800",
    ring: "ring-emerald-200",
  },
  violet: {
    chip: "bg-violet-50 text-violet-700 ring-violet-200/70",
    dot: "bg-violet-500",
    soft: "bg-violet-50",
    text: "text-violet-700",
    gradient: "from-violet-500 via-purple-600 to-fuchsia-800",
    ring: "ring-violet-200",
  },
};
