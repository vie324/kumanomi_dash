import { getAccessibleStoreIds, getCurrentMember, getPermissionMatrix } from "./auth";
import { can, type PermissionMatrix, type PermLevel, type Resource } from "./permissions";
import type { Member } from "./types";

// 指定リソースに必要レベル以上を持つことを保証。
// 満たさなければ null を返す（呼び出し側でガード表示）。
export async function requirePermission(
  resource: Resource,
  level: PermLevel = "manage"
): Promise<{ member: Member; matrix: PermissionMatrix } | null> {
  const member = await getCurrentMember();
  if (!member) return null;
  const matrix = await getPermissionMatrix();
  if (!can(matrix, member, resource, level)) return null;
  return { member, matrix };
}

// ページ表示用ガード: ログイン + 閲覧権限 + アクセス可能店舗を一括で解決。
// 返り値:
//   member            … ログイン中メンバー（未ログインは null）
//   matrix            … 権限マトリクス
//   allowed           … resource を閲覧できるか
//   storeIds          … アクセス可能店舗ID（null = 全店舗）
export async function loadPageAccess(resource: Resource): Promise<
  | { member: null }
  | {
      member: Member;
      matrix: PermissionMatrix;
      allowed: boolean;
      storeIds: string[] | null;
    }
> {
  const member = await getCurrentMember();
  if (!member) return { member: null };
  const matrix = await getPermissionMatrix();
  const allowed = can(matrix, member, resource, "view");
  const storeIds = await getAccessibleStoreIds(member);
  return { member, matrix, allowed, storeIds };
}

