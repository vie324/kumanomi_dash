// 権限ロジックの中核（RBAC）
// アプリ層・RLS の両方が同じ概念を共有するためのヘルパー。

import type { Member, Role, Scope } from "./types";

// 機能（リソース）
export type Resource =
  | "dashboard"
  | "daily_reports"
  | "cashbook"
  | "attendance"
  | "members"
  | "posture"
  | "report_card"
  | "staff_admin"
  | "org_admin";

export const RESOURCE_LABELS: Record<Resource, string> = {
  dashboard: "ダッシュボード",
  daily_reports: "日報",
  cashbook: "出納帳",
  attendance: "勤怠",
  members: "会員・回数券",
  posture: "姿勢分析",
  report_card: "施術レポート",
  staff_admin: "スタッフ・権限管理",
  org_admin: "店舗・部門設定",
};

export const RESOURCES = Object.keys(RESOURCE_LABELS) as Resource[];

// 権限レベル（順序つき）
export type PermLevel = "none" | "view" | "edit" | "manage";
export const LEVEL_RANK: Record<PermLevel, number> = { none: 0, view: 1, edit: 2, manage: 3 };
export const LEVEL_LABELS: Record<PermLevel, string> = {
  none: "なし",
  view: "閲覧",
  edit: "編集",
  manage: "管理",
};

// role × resource → level の表（DBの role_permissions から構築）
export type PermissionMatrix = Record<string, Partial<Record<Resource, PermLevel>>>;

// 役割の既定スコープ
export function defaultScope(role: Role): Scope {
  switch (role) {
    case "owner":
      return "all";
    case "dept_manager":
      return "department";
    case "manager":
      return "assigned";
    case "store_manager":
      return "store";
    default:
      return "store";
  }
}

export function memberScope(member: Pick<Member, "role" | "scope">): Scope {
  return member.scope ?? defaultScope(member.role);
}

// 指定リソースに対する member のレベルを取得
export function levelFor(matrix: PermissionMatrix, role: Role, resource: Resource): PermLevel {
  return matrix[role]?.[resource] ?? "none";
}

// 権限判定: 必要レベル以上か
export function can(
  matrix: PermissionMatrix,
  member: Pick<Member, "role">,
  resource: Resource,
  required: PermLevel = "view"
): boolean {
  return LEVEL_RANK[levelFor(matrix, member.role, resource)] >= LEVEL_RANK[required];
}

// よく使うショートカット
export const canView = (m: PermissionMatrix, mem: Pick<Member, "role">, r: Resource) =>
  can(m, mem, r, "view");
export const canEdit = (m: PermissionMatrix, mem: Pick<Member, "role">, r: Resource) =>
  can(m, mem, r, "edit");
export const canManage = (m: PermissionMatrix, mem: Pick<Member, "role">, r: Resource) =>
  can(m, mem, r, "manage");

// ------------------------------------------------------------
// データ範囲（スコープ）の解決
// ------------------------------------------------------------
// アクセスできる店舗ID集合を返す。
//   all        → null（= 全店舗。呼び出し側でフィルタしない）
//   department → 同部門の店舗（allStores から算出）
//   assigned   → member_store_access の割当（assignedStoreIds）
//   store/own  → 自店舗のみ
// own の「自分のデータのみ」判定は別途 isOwnOnly() を使う。
export function accessibleStoreIds(
  member: Pick<Member, "role" | "scope" | "store_id" | "department_id">,
  opts: {
    allStores?: { id: string; department_id: string | null }[];
    assignedStoreIds?: string[];
  } = {}
): string[] | null {
  const scope = memberScope(member);
  if (scope === "all") return null; // 全店舗
  if (scope === "department") {
    const stores = opts.allStores ?? [];
    const ids = stores
      .filter((s) => s.department_id && s.department_id === member.department_id)
      .map((s) => s.id);
    // 自店舗も必ず含める
    if (!ids.includes(member.store_id)) ids.push(member.store_id);
    return ids;
  }
  if (scope === "assigned") {
    const ids = [...(opts.assignedStoreIds ?? [])];
    if (!ids.includes(member.store_id)) ids.push(member.store_id);
    return ids;
  }
  // store / own
  return [member.store_id];
}

// 「自分のデータのみ」スコープか（例: staff の日報は own）
export function isOwnOnly(member: Pick<Member, "role" | "scope">, resource: Resource): boolean {
  // 既定では staff の daily_reports のみ own 扱い。
  // （Phase B で resource 別スコープを細分化する余地を残す）
  return member.role === "staff" && resource === "daily_reports";
}
