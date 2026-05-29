// アプリ共通の型定義

export type Store = {
  id: string;
  name: string;
  monthly_target_revenue: number;
  daily_target_new: number;
  daily_target_contract: number;
  active: boolean;
};

export type Member = {
  id: string;
  auth_user_id: string | null;
  store_id: string;
  name: string;
  email: string | null;
  role: "staff" | "manager" | "admin";
  active: boolean;
};

export type ChannelKey = "hpb" | "meta" | "referral" | "discount";

export const CHANNELS: { key: ChannelKey; label: string }[] = [
  { key: "hpb", label: "HPB" },
  { key: "meta", label: "Meta広告" },
  { key: "referral", label: "紹介" },
  { key: "discount", label: "割引/その他" },
];

export type DailyReport = {
  id: string;
  store_id: string;
  member_id: string;
  report_date: string; // YYYY-MM-DD
  revenue: number;
  target_revenue: number;

  hpb_new: number;
  hpb_contract: number;
  meta_new: number;
  meta_contract: number;
  referral_new: number;
  referral_contract: number;
  discount_new: number;
  discount_contract: number;

  existing_treatments: number;
  daily_tasks_completed: boolean;
  tomorrow_prep_completed: boolean;
  note: string | null;

  created_at: string;
  updated_at: string;
};

export type ContractOutcome = "won" | "lost";

export type ContractMemo = {
  id: string;
  report_id: string;
  store_id: string;
  member_id: string;
  outcome: ContractOutcome;
  channel: string | null;
  customer_name: string | null;
  customer_attr: string | null;
  reason: string | null;
  next_action: string | null;
  created_at: string;
};

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

// 集計ヘルパ
export function totalNew(r: DailyReport): number {
  return r.hpb_new + r.meta_new + r.referral_new + r.discount_new;
}
export function totalContract(r: DailyReport): number {
  return r.hpb_contract + r.meta_contract + r.referral_contract + r.discount_contract;
}
