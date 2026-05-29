"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember, getPermissionMatrix } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, type PermLevel, type Resource } from "@/lib/permissions";
import type { Role, Scope } from "@/lib/types";

// 共通: staff_admin を manage できるユーザーか検証
async function assertStaffAdmin() {
  const member = await getCurrentMember();
  if (!member) throw new Error("unauthorized");
  const matrix = await getPermissionMatrix();
  if (!can(matrix, member, "staff_admin", "manage")) {
    throw new Error("forbidden");
  }
  return member;
}

// 権限マトリクスの1セルを更新
export async function updateRolePermission(role: Role, resource: Resource, level: PermLevel) {
  await assertStaffAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("role_permissions")
    .upsert({ role, resource, level }, { onConflict: "role,resource" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/roles");
}

// メンバーの役割・スコープ・部門を更新
export async function updateMemberRole(args: {
  memberId: string;
  role: Role;
  scope: Scope | null;
  departmentId: string | null;
}) {
  await assertStaffAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("members")
    .update({ role: args.role, scope: args.scope, department_id: args.departmentId })
    .eq("id", args.memberId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/members");
}

// マネージャーの担当店舗を置き換え
export async function setMemberStores(memberId: string, storeIds: string[]) {
  await assertStaffAdmin();
  const admin = createAdminClient();
  const { error: delErr } = await admin
    .from("member_store_access")
    .delete()
    .eq("member_id", memberId);
  if (delErr) throw new Error(delErr.message);
  if (storeIds.length > 0) {
    const rows = storeIds.map((store_id) => ({ member_id: memberId, store_id }));
    const { error } = await admin.from("member_store_access").insert(rows);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/admin/members");
}
