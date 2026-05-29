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
  contract_type: ContractType | null; // 回数券 / 定額（契約時のみ）
  contract_plan: number | null; // 回数券:4/8/16/32  定額:月2/4/6/8
  customer_name: string | null;
  customer_attr: string | null;
  reason: string | null; // 取れた理由 / 取れなかった理由
  created_at: string;
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
