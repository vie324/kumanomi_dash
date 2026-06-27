import { createClient } from "./supabase/server";
import type { Member } from "./types";
import {
  accessibleStoreIds,
  type PermissionMatrix,
  type PermLevel,
  type Resource,
} from "./permissions";

// 現在ログイン中のメンバー行を取得（auth.users → members）
export async function getCurrentMember(): Promise<Member | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("members")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const member = (data as Member) ?? null;
  // 無効化されたメンバー(active=false)はアクセスを失う
  if (member && member.active === false) return null;
  return member;
}

// 権限マトリクスを DB から構築
export async function getPermissionMatrix(): Promise<PermissionMatrix> {
  const supabase = createClient();
  const { data, error } = await supabase.from("role_permissions").select("role, resource, level");
  // 読み取りに失敗してもここで throw すると、このマトリクスは全ページが通るため
  // 画面全体がクラッシュ（error.tsx）してしまう。サーバーログに残しつつ空で返し、
  // 縮退（必要な権限が無い表示）にとどめてアプリを落とさない。
  if (error) {
    console.error("[getPermissionMatrix] role_permissions の取得に失敗:", error.message);
    return {};
  }
  const matrix: PermissionMatrix = {};
  for (const row of (data as { role: string; resource: Resource; level: PermLevel }[]) || []) {
    (matrix[row.role] ||= {})[row.resource] = row.level;
  }
  return matrix;
}

// member のアクセス可能店舗IDを解決（null = 全店舗）
export async function getAccessibleStoreIds(member: Member): Promise<string[] | null> {
  const supabase = createClient();
  const scope = member.scope ?? undefined;
  // assigned/department のときだけ追加クエリ
  let assignedStoreIds: string[] | undefined;
  let allStores: { id: string; department_id: string | null }[] | undefined;

  if (scope === "assigned" || member.role === "manager") {
    const { data, error } = await supabase
      .from("member_store_access")
      .select("store_id")
      .eq("member_id", member.id);
    // 失敗時は throw せずログ＋空扱い（最終的に自店のみへ安全側に縮退）。
    if (error) console.error("[getAccessibleStoreIds] member_store_access の取得に失敗:", error.message);
    assignedStoreIds = (data as { store_id: string }[] | null)?.map((r) => r.store_id) ?? [];
  }
  if (scope === "department" || member.role === "dept_manager") {
    const { data, error } = await supabase.from("stores").select("id, department_id");
    if (error) console.error("[getAccessibleStoreIds] stores の取得に失敗:", error.message);
    allStores = (data as { id: string; department_id: string | null }[]) || [];
  }

  return accessibleStoreIds(member, { allStores, assignedStoreIds });
}
