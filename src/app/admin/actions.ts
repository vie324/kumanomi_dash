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
// スタッフ（メンバー）の追加・削除
// ------------------------------------------------------------
// Auth ユーザーを作成し、members 行を作る。
export async function createStaffMember(args: {
  name: string;
  email: string;
  password: string;
  storeId: string;
  role?: Role;
}) {
  await assertStaffAdmin();
  const name = args.name.trim();
  const email = args.email.trim().toLowerCase();
  const role: Role = args.role ?? "staff";
  if (!name) throw new Error("氏名を入力してください");
  if (!email) throw new Error("メールアドレスを入力してください");
  if (!args.password || args.password.length < 6) {
    throw new Error("パスワードは6文字以上にしてください");
  }

  const admin = createAdminClient();

  // 1) Auth ユーザー作成（メール確認済み）
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: args.password,
    email_confirm: true,
    user_metadata: { name, store_id: args.storeId },
  });
  if (createErr) {
    // 既に存在する場合などは分かりやすいメッセージに
    throw new Error(createErr.message);
  }
  const userId = created.user!.id;

  // 店舗の業態・部門をメンバーに引き継ぐ
  const { data: storeRow } = await admin
    .from("stores")
    .select("genre, department_id")
    .eq("id", args.storeId)
    .maybeSingle();
  const genre = (storeRow as { genre: string } | null)?.genre ?? "seitai";
  const departmentId = (storeRow as { department_id: string | null } | null)?.department_id ?? null;

  // 2) members 行（auth_user_id で upsert）
  const { error: memberErr } = await admin.from("members").upsert(
    {
      auth_user_id: userId,
      store_id: args.storeId,
      name,
      email,
      role,
      scope: role === "staff" ? "store" : null,
      genre,
      department_id: departmentId,
      active: true,
    },
    { onConflict: "auth_user_id" }
  );
  if (memberErr) {
    // members 作成に失敗したら Auth ユーザーも巻き戻す
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(memberErr.message);
  }
  revalidatePath("/admin/members");
}

// メンバーと紐づく Auth ユーザーを削除
export async function deleteStaffMember(memberId: string) {
  const current = await assertStaffAdmin();
  if (current.id === memberId) {
    throw new Error("自分自身は削除できません");
  }
  const admin = createAdminClient();
  // 対象メンバーの auth_user_id を取得
  const { data: target, error: fetchErr } = await admin
    .from("members")
    .select("auth_user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);

  // members 行を削除（関連は外部キーの on delete で処理）
  const { error: delErr } = await admin.from("members").delete().eq("id", memberId);
  if (delErr) throw new Error(delErr.message);

  // Auth ユーザーも削除
  const authId = (target as { auth_user_id: string | null } | null)?.auth_user_id;
  if (authId) {
    await admin.auth.admin.deleteUser(authId).catch(() => {});
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

// ------------------------------------------------------------
// メニュー・料金表（menu_plans）。編集は org_admin の edit 以上。
// ------------------------------------------------------------
async function assertMenuAdmin() {
  const member = await getCurrentMember();
  if (!member) throw new Error("unauthorized");
  const matrix = await getPermissionMatrix();
  if (!can(matrix, member, "org_admin", "edit")) throw new Error("forbidden");
  return member;
}

export async function updateMenuPlan(args: {
  id: string;
  label?: string | null;
  variant?: string | null;
  sessions?: number | null;
  price?: number | null;
  unit_price?: number | null;
  note?: string | null;
  active?: boolean;
}) {
  await assertMenuAdmin();
  const patch: Record<string, unknown> = {};
  for (const k of ["label", "variant", "sessions", "price", "unit_price", "note", "active"] as const) {
    if (args[k] !== undefined) patch[k] = args[k];
  }
  const admin = createAdminClient();
  const { error } = await admin.from("menu_plans").update(patch).eq("id", args.id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}

export async function addMenuPlan(args: {
  genre: "seitai" | "esthe";
  storeId: string | null;
  section: string;
  groupName: string;
  variant?: string | null;
  label?: string | null;
  sessions?: number | null;
  price?: number | null;
  unitPrice?: number | null;
  note?: string | null;
}) {
  await assertMenuAdmin();
  if (!args.section.trim() || !args.groupName.trim()) {
    throw new Error("セクションとグループ名は必須です");
  }
  const admin = createAdminClient();
  const { data: maxRow } = await admin
    .from("menu_plans")
    .select("sort_order")
    .eq("section", args.section)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow?.sort_order as number) ?? 0) + 1;
  const { error } = await admin.from("menu_plans").insert({
    genre: args.genre,
    store_id: args.storeId,
    section: args.section.trim(),
    group_name: args.groupName.trim(),
    variant: args.variant ?? null,
    label: args.label ?? null,
    sessions: args.sessions ?? null,
    price: args.price ?? null,
    unit_price: args.unitPrice ?? null,
    note: args.note ?? null,
    sort_order: nextOrder,
    active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}

export async function deleteMenuPlan(id: string) {
  await assertMenuAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("menu_plans").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}
