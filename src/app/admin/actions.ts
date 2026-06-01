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

// ------------------------------------------------------------
// 媒体（集客チャネル）マスタ
// ------------------------------------------------------------
export async function addMediaChannel(args: { storeId: string; name: string }) {
  await assertStaffAdmin();
  const name = args.name.trim();
  if (!name) throw new Error("媒体名を入力してください");
  const admin = createAdminClient();
  // 末尾の sort_order を計算
  const { data: maxRow } = await admin
    .from("media_channels")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow?.sort_order as number) ?? 0) + 1;
  const { error } = await admin
    .from("media_channels")
    .insert({ store_id: args.storeId, name, sort_order: nextOrder, active: true });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/media");
}

export async function updateMediaChannel(args: {
  id: string;
  name?: string;
  active?: boolean;
  sortOrder?: number;
}) {
  await assertStaffAdmin();
  const patch: Record<string, unknown> = {};
  if (args.name !== undefined) patch.name = args.name.trim();
  if (args.active !== undefined) patch.active = args.active;
  if (args.sortOrder !== undefined) patch.sort_order = args.sortOrder;
  const admin = createAdminClient();
  const { error } = await admin.from("media_channels").update(patch).eq("id", args.id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/media");
}

export async function deleteMediaChannel(id: string) {
  await assertStaffAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("media_channels").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/media");
}
