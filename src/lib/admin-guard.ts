import { getCurrentMember, getPermissionMatrix } from "./auth";
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
