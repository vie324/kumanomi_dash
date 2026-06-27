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
  // エラーを握りつぶすと空マトリクス＝全員ロックアウトになり原因が見えない。
  // 例外として表面化し、error.tsx で再読み込み導線を出す。
  if (error) throw new Error(`権限情報の取得に失敗しました: ${error.message}`);
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
    // エラーを無視すると担当店舗が空になりスコープが静かに自店のみへ縮小する
    if (error) throw new Error(`担当店舗の取得に失敗しました: ${error.message}`);
    assignedStoreIds = (data as { store_id: string }[] | null)?.map((r) => r.store_id) ?? [];
  }
  if (scope === "department" || member.role === "dept_manager") {
    const { data, error } = await supabase.from("stores").select("id, department_id");
    if (error) throw new Error(`店舗一覧の取得に失敗しました: ${error.message}`);
    allStores = (data as { id: string; department_id: string | null }[]) || [];
  }

  return accessibleStoreIds(member, { allStores, assignedStoreIds });
}
