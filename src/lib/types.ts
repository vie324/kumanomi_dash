// アプリ共通の型定義

import { todayJST, diffDays } from "./date";

// 業態
export type Genre = "seitai" | "esthe";
export const GENRE_LABELS: Record<Genre, string> = {
  seitai: "整体",
  esthe: "エステ",
};

// 業態ごとのブランド表示（名称・ロゴ）
export type Brand = { name: string; tagline: string; logo: string };
export const GENRE_BRAND: Record<Genre, Brand> = {
  seitai: {
    name: "くまのみ整体院",
    tagline: "整骨院・整体院グループ",
    // public/ に配置（背景透過）
    logo: "/logo-kumanomi.webp",
  },
  esthe: {
    name: "Premium Body Balance",
    tagline: "骨盤矯正・ダイエット・小顔専門店",
    // public/ に配置（背景透過）
    logo: "/logo-pbb.webp",
  },
};

export type Store = {
  id: string;
  name: string;
  genre: Genre;
  monthly_target_revenue: number;
  daily_target_new: number;
  daily_target_contract: number;
  active: boolean;
  lat: number | null;
  lng: number | null;
  department_id: string | null;
};

export type Department = {
  id: string;
  name: string;
  created_at: string;
};

// 役割（強い順）: owner > dept_manager > manager > store_manager > staff
export type Role = "owner" | "dept_manager" | "manager" | "store_manager" | "staff";
// データ範囲
export type Scope = "all" | "department" | "assigned" | "store" | "own";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "全体管理者",
  dept_manager: "部門管理者",
  manager: "マネージャー",
  store_manager: "店長",
  staff: "スタッフ",
};

export const ROLE_ORDER: Role[] = ["owner", "dept_manager", "manager", "store_manager", "staff"];

export type Member = {
  id: string;
  auth_user_id: string | null;
  store_id: string;
  name: string;
  email: string | null;
  role: Role;
  scope: Scope | null;
  department_id: string | null;
  genre: Genre;
  active: boolean;
};

// 日報（新仕様）
export type DailyReport = {
  id: string;
  store_id: string;
  member_id: string;
  report_date: string; // YYYY-MM-DD

  revenue: number; // 売上

  existing_treatments: number; // 施術数（既存のみ・新患含めない）
  next_reservations: number; // うち次回予約数

  new_count: number; // 新規数
  second_visit_reservations: number; // うち2回目予約につながった数

  reflection: string | null; // 今日の振り返り
  tomorrow_action: string | null; // 明日の行動

  // エステ追加項目（整体では未使用）
  product_sales: number; // 物販売上(円)
  new_product_sales: number; // 新規の物販売上(円)
  renewal_contracts: number; // 継続契約(件)
  renewal_sales: number; // 継続売上(円)
  new_trial_amount: number; // 新規の体験金額(円)
  other_amount: number; // その他(円)
  other_note: string | null; // その他メモ

  created_at: string;
  updated_at: string;
};

export type ContractOutcome = "won" | "lost";
export type ContractType = "ticket" | "subscription";

// 新規のお客様ごとの契約記録
export type ContractMemo = {
  id: string;
  report_id: string;
  store_id: string;
  member_id: string;
  outcome: ContractOutcome; // won=契約 / lost=未契約
  channel: string | null; // 媒体名（media_channels.name を保存）
  contract_type: ContractType | null; // 回数券 / 定額（契約時のみ）
  contract_plan: number | null; // 回数券:4/8/16/32  定額:月2/4/6/8
  customer_name: string | null;
  customer_attr: string | null;
  reason: string | null; // 取れた理由 / 取れなかった理由
  amount: number | null; // 契約金額（メニュー金額/単価。選択or手入力）
  menu_plan_id: string | null; // 契約したメニュー（料金表）
  menu_label: string | null; // 表示用スナップショット
  menu_sessions: number | null; // 回数（選択or手入力）
  created_at: string;
};

// 媒体（集客チャネル）マスタ
export type MediaChannel = {
  id: string;
  store_id: string | null;
  genre: Genre | null; // null = 全業態共通
  name: string;
  sort_order: number;
  active: boolean;
  unit_price: boolean; // true = 日報で単価(金額)を入力させる
  created_at: string;
};

// メニュー・料金表マスタ
export type MenuPlan = {
  id: string;
  genre: Genre;
  store_id: string | null;
  section: string;
  group_name: string;
  variant: string | null;
  label: string | null;
  sessions: number | null;
  price: number | null;
  unit_price: number | null;
  note: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

// 契約プラン選択肢
export const TICKET_PLANS = [4, 8, 16, 32]; // 回数券（回）
export const SUBSCRIPTION_PLANS = [2, 4, 6, 8]; // 定額（月N回）

export function contractTypeLabel(t: ContractType | null): string {
  if (t === "ticket") return "回数券";
  if (t === "subscription") return "定額";
  return "";
}

export function contractLabel(m: Pick<ContractMemo, "contract_type" | "contract_plan">): string {
  if (!m.contract_type || m.contract_plan == null) return "";
  if (m.contract_type === "ticket") return `回数券${m.contract_plan}回`;
  return `定額 月${m.contract_plan}回`;
}

export type AiFeedback = {
  id: string;
  report_id: string;
  model: string | null;
  summary: string | null;
  issues: string | null;
  advice: string | null;
  encouragement: string | null;
  raw: unknown;
  created_at: string;
};

// ============================================================
// スタッフ個人目標（店舗×月）
// ============================================================
export type StaffGoal = {
  id: string;
  member_id: string;
  store_id: string;
  month: string; // 'YYYY-MM'
  new_sales_target: number; // 新規売上目標(円)
  new_contract_rate_target: number; // 新規契約率目標(%)
  product_target: number; // 物販目標(円)
  existing_sales_target: number; // 既存売上目標(円)
  created_at: string;
  updated_at: string;
};

// ヴァンヴェール媒体名（新規契約はコース内容を手入力）。表記ゆれを許容。
export const VEMBERT_CHANNELS = ["ヴァンヴェール", "ヴァンベール"];
export function isVembertChannel(channel: string | null | undefined): boolean {
  return !!channel && VEMBERT_CHANNELS.includes(channel.trim());
}

// 店舗責任者向け スタッフAIコーチング
export type StaffCoaching = {
  id: string;
  member_id: string;
  store_id: string;
  month: string; // 'YYYY-MM'
  model: string | null;
  strengths: string | null;
  issues: string | null;
  coaching: string | null;
  raw: unknown;
  created_at: string;
  updated_at: string;
};

// ============================================================
// 出納帳
// ============================================================
export type CashEntryType = "income" | "expense";
export type PaymentMethod = "CASH" | "QR" | "CARD" | "SQUARE" | "TRANSFER";

export type CashbookEntry = {
  id: string;
  store_id: string;
  member_id: string | null;
  entry_date: string; // YYYY-MM-DD
  type: CashEntryType;
  category: string;
  amount: number;
  payment_method: PaymentMethod;
  description: string | null;
  customer_name: string | null;
  treatment_count: number;
  recorder: string | null;
  notes: string | null;
  is_cash_check: boolean;
  created_at: string;
  updated_at: string;
};

// ============================================================
// 会員・回数券
// ============================================================
export type Customer = {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type TicketPlan = {
  id: string;
  store_id: string;
  name: string;
  sessions: number;
  price: number;
  validity_days: number;
  active: boolean;
  created_at: string;
};

export type CustomerTicket = {
  id: string;
  store_id: string;
  customer_id: string | null;
  plan_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  plan_name: string | null;
  total_sessions: number;
  remaining_sessions: number;
  price: number;
  purchase_date: string;
  expiration_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketStatus = "active" | "expiring" | "expired" | "completed";

export function ticketStatus(t: Pick<CustomerTicket, "remaining_sessions" | "expiration_date">): TicketStatus {
  if (t.remaining_sessions <= 0) return "completed";
  if (t.expiration_date) {
    // JSTの暦日基準で「期限 − 今日」を算出（UTC変換による期限当日のズレを防ぐ）
    const days = diffDays(todayJST(), t.expiration_date);
    if (days < 0) return "expired";
    if (days <= 30) return "expiring";
  }
  return "active";
}

export function ticketStatusLabel(s: TicketStatus): string {
  return { active: "有効", expiring: "期限間近", expired: "期限切れ", completed: "消化済" }[s];
}

export const INCOME_CATEGORIES = [
  "施術売上",
  "サブスク月額",
  "回数券販売",
  "物販",
  "その他収入",
];
export const EXPENSE_CATEGORIES = [
  "家賃",
  "水道光熱費",
  "消耗品",
  "広告費",
  "人件費",
  "設備",
  "交通費",
  "その他経費",
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; short: string }[] = [
  { value: "CASH", label: "現金", short: "現金" },
  { value: "QR", label: "QR決済", short: "QR" },
  { value: "CARD", label: "カード", short: "ｶｰﾄﾞ" },
  { value: "SQUARE", label: "Square", short: "Sq" },
  { value: "TRANSFER", label: "振込", short: "振込" },
];

export function paymentMethodLabel(m: PaymentMethod): string {
  return PAYMENT_METHODS.find((p) => p.value === m)?.short || "現金";
}

// ============================================================
// 勤怠
// ============================================================
export type AttendanceRecord = {
  id: string;
  store_id: string;
  member_id: string;
  work_date: string; // YYYY-MM-DD
  clock_in_at: string | null;
  clock_out_at: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  method: "gps" | "manual";
  note: string | null;
  break_started_at: string | null; // 休憩中の開始時刻（休憩していなければ null）
  break_minutes: number; // その日の休憩の累計（分）
  created_at: string;
  updated_at: string;
};

// ============================================================
// 姿勢分析・施術レポート（保存・履歴）
// ============================================================
export type PostureRecord = {
  id: string;
  store_id: string;
  member_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  record_date: string;
  mode: "front" | "side";
  total_score: number | null;
  items: { key: string; label: string; value: string; score: number; detail: string }[] | null;
  note: string | null;
  created_at: string;
};

export type TreatmentReportRow = {
  id: string;
  store_id: string;
  member_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  visit_date: string;
  genre: string | null;
  staff_name: string | null;
  menus: string[] | null;
  scores: Record<string, number> | null;
  avg_score: number | null;
  comment: string | null;
  care: string[] | null;
  care_note: string | null;
  next_offer: string | null;
  next_expiry: string | null;
  created_at: string;
};

// 2点間の距離（メートル, Haversine）
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)));
}

// 予約転換率（%）
export function reservationRate(report: DailyReport): number {
  return report.existing_treatments > 0
    ? (report.next_reservations / report.existing_treatments) * 100
    : 0;
}
export function secondVisitRate(report: DailyReport): number {
  return report.new_count > 0
    ? (report.second_visit_reservations / report.new_count) * 100
    : 0;
}
