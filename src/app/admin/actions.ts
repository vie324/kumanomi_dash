"use server";

import { revalidatePath } from "next/cache";
import { getAccessibleStoreIds, getCurrentMember, getPermissionMatrix } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  can,
  effectiveScope,
  roleRank,
  scopeRank,
  type PermLevel,
  type Resource,
} from "@/lib/permissions";
import type { Member, Role, Scope } from "@/lib/types";

type AdminClient = ReturnType<typeof createAdminClient>;

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

// 監査ログ記録（service role）。記録失敗は本処理を妨げない。
async function logAudit(
  actor: Member,
  action: string,
  targetType: string,
  targetId: string | null,
  detail?: Record<string, unknown>
) {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_member_id: actor.id,
      actor_name: actor.name,
      action,
      target_type: targetType,
      target_id: targetId,
      detail: detail ?? null,
    });
  } catch {
    /* 監査ログの失敗は無視 */
  }
}

// スコープIDOR防止: 対象店舗が actor の管轄（アクセス可能店舗）内か検証。
// null = 全社（owner 等）は無制限。
async function assertCanManageStore(actor: Member, storeId: string) {
  const ids = await getAccessibleStoreIds(actor);
  if (ids === null) return;
  if (!ids.includes(storeId)) {
    throw new Error("管轄外の店舗に対する操作はできません。");
  }
}

// 対象メンバーが actor の管轄内かつ自分以下の役割かを検証し、対象行を返す。
async function assertCanManageMember(actor: Member, memberId: string, admin: AdminClient) {
  const { data } = await admin
    .from("members")
    .select("store_id, role")
    .eq("id", memberId)
    .maybeSingle();
  const t = data as { store_id: string; role: Role } | null;
  if (!t) throw new Error("対象メンバーが見つかりません。");
  // 自分自身（自店）は常に管轄内。それ以外はスコープを検証。
  if (memberId !== actor.id) await assertCanManageStore(actor, t.store_id);
  // 自分より上位のメンバーは操作不可
  if (memberId !== actor.id && roleRank(t.role) > roleRank(actor.role)) {
    throw new Error("自分より上位のメンバーは操作できません。");
  }
  return t;
}

// 権限昇格ガード: actor は自分の役割/データ範囲を超える付与をできない。
function assertAssignable(
  actor: Member,
  targetRole: Role,
  targetScope: Scope | null,
  opts: { targetId?: string; prevRole?: Role } = {}
) {
  const actorRoleRank = roleRank(actor.role);
  if (roleRank(targetRole) > actorRoleRank) {
    throw new Error("自分より上位の役割は割り当てできません。");
  }
  // 自分自身の昇格は不可
  if (opts.targetId && opts.targetId === actor.id && opts.prevRole && roleRank(targetRole) > roleRank(opts.prevRole)) {
    throw new Error("自分自身の役割を上げることはできません。");
  }
  if (targetScope) {
    const actorScopeRank = scopeRank(effectiveScope(actor));
    if (scopeRank(targetScope) > actorScopeRank) {
      throw new Error("自分より広いデータ範囲は割り当てできません。");
    }
  }
}

// 権限マトリクスの1セルを更新（capability マトリクスは owner 限定）
export async function updateRolePermission(role: Role, resource: Resource, level: PermLevel) {
  const actor = await assertStaffAdmin();
  if (actor.role !== "owner") {
    throw new Error("権限マトリクスの編集は全体管理者(owner)のみ可能です。");
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("role_permissions")
    .upsert({ role, resource, level }, { onConflict: "role,resource" });
  if (error) throw new Error(error.message);
  await logAudit(actor, "role_permission.update", "role_permissions", role, { resource, level });
  revalidatePath("/admin/roles");
}

// メンバーの役割・スコープ・部門を更新
export async function updateMemberRole(args: {
  memberId: string;
  role: Role;
  scope: Scope | null;
  departmentId: string | null;
}) {
  const actor = await assertStaffAdmin();
  const admin = createAdminClient();
  // 対象が管轄内かつ自分以下かを検証し、現在の役割を取得（自己昇格チェック用）
  const target = await assertCanManageMember(actor, args.memberId, admin);
  assertAssignable(actor, args.role, args.scope, { targetId: args.memberId, prevRole: target.role });
  const { error } = await admin
    .from("members")
    .update({ role: args.role, scope: args.scope, department_id: args.departmentId })
    .eq("id", args.memberId);
  if (error) throw new Error(error.message);
  await logAudit(actor, "member.role_update", "member", args.memberId, {
    role: args.role,
    scope: args.scope,
    department_id: args.departmentId,
  });
  revalidatePath("/admin/members");
}

// マネージャーの担当店舗を置き換え
export async function setMemberStores(memberId: string, storeIds: string[]) {
  const actor = await assertStaffAdmin();
  const admin = createAdminClient();
  await assertCanManageMember(actor, memberId, admin);
  // 自分の管轄外の店舗を担当に割り当てることはできない
  for (const sid of storeIds) await assertCanManageStore(actor, sid);
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
  await logAudit(actor, "member.stores_set", "member", memberId, { storeIds });
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
  const actor = await assertStaffAdmin();
  const name = args.name.trim();
  const email = args.email.trim().toLowerCase();
  const role: Role = args.role ?? "staff";
  // 自分より上位の役割でスタッフを作成することはできない
  assertAssignable(actor, role, role === "staff" ? "store" : null);
  // 管轄外の店舗にメンバーを作成することはできない
  await assertCanManageStore(actor, args.storeId);
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
  await logAudit(actor, "member.create", "member", userId, { name, email, role, storeId: args.storeId });
  revalidatePath("/admin/members");
}

// メンバーを無効化（ソフトデリート）。
// 日報など member_id を参照する過去データを残すため members 行は削除せず、
// active=false にして auth ユーザーを削除（ログインを剥奪）する。
// ※ 旧実装は members を物理削除しており、ON DELETE CASCADE で当該メンバーの
//   daily_reports / contract_memos まで消えていた（データ消失リスク）。
export async function deleteStaffMember(memberId: string) {
  const current = await assertStaffAdmin();
  if (current.id === memberId) {
    throw new Error("自分自身は削除できません");
  }
  const admin = createAdminClient();
  // 対象が管轄内かつ自分以下かを検証
  await assertCanManageMember(current, memberId, admin);
  // 対象メンバーの auth_user_id を取得
  const { data: target, error: fetchErr } = await admin
    .from("members")
    .select("auth_user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);

  // ソフトデリート（過去の記録は保持）。ログイン剥奪のため auth_user_id も外す。
  const { error: updErr } = await admin
    .from("members")
    .update({ active: false, auth_user_id: null })
    .eq("id", memberId);
  if (updErr) throw new Error(updErr.message);

  // Auth ユーザーを削除（ログインできなくする）
  const authId = (target as { auth_user_id: string | null } | null)?.auth_user_id;
  if (authId) {
    await admin.auth.admin.deleteUser(authId).catch(() => {});
  }
  await logAudit(current, "member.deactivate", "member", memberId);
  revalidatePath("/admin/members");
}

// ------------------------------------------------------------
// 媒体（集客チャネル）マスタ
// ------------------------------------------------------------
export async function addMediaChannel(args: { storeId: string; name: string }) {
  const actor = await assertStaffAdmin();
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
  await logAudit(actor, "media_channel.add", "media_channel", null, { name, storeId: args.storeId });
  revalidatePath("/admin/media");
}

export async function updateMediaChannel(args: {
  id: string;
  name?: string;
  active?: boolean;
  sortOrder?: number;
}) {
  const actor = await assertStaffAdmin();
  const patch: Record<string, unknown> = {};
  if (args.name !== undefined) patch.name = args.name.trim();
  if (args.active !== undefined) patch.active = args.active;
  if (args.sortOrder !== undefined) patch.sort_order = args.sortOrder;
  const admin = createAdminClient();
  const { error } = await admin.from("media_channels").update(patch).eq("id", args.id);
  if (error) throw new Error(error.message);
  await logAudit(actor, "media_channel.update", "media_channel", args.id, patch);
  revalidatePath("/admin/media");
}

export async function deleteMediaChannel(id: string) {
  const actor = await assertStaffAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("media_channels").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAudit(actor, "media_channel.delete", "media_channel", id);
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
  const actor = await assertMenuAdmin();
  const patch: Record<string, unknown> = {};
  for (const k of ["label", "variant", "sessions", "price", "unit_price", "note", "active"] as const) {
    if (args[k] !== undefined) patch[k] = args[k];
  }
  const admin = createAdminClient();
  const { error } = await admin.from("menu_plans").update(patch).eq("id", args.id);
  if (error) throw new Error(error.message);
  await logAudit(actor, "menu_plan.update", "menu_plan", args.id, patch);
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
  const actor = await assertMenuAdmin();
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
  await logAudit(actor, "menu_plan.add", "menu_plan", null, {
    genre: args.genre,
    section: args.section.trim(),
    groupName: args.groupName.trim(),
  });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}

export async function deleteMenuPlan(id: string) {
  const actor = await assertMenuAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("menu_plans").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAudit(actor, "menu_plan.delete", "menu_plan", id);
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}

// ------------------------------------------------------------
// 目標設定（スタッフ個人目標 / 店舗の月間目標）。店長(store_manager)以上。
// ------------------------------------------------------------
async function assertGoalsManager() {
  const member = await getCurrentMember();
  if (!member) throw new Error("unauthorized");
  const matrix = await getPermissionMatrix();
  // 日報の編集権限があり、かつ店長以上の役割であること
  if (!can(matrix, member, "daily_reports", "edit") || roleRank(member.role) < roleRank("store_manager")) {
    throw new Error("forbidden");
  }
  return member;
}

const num = (v: number) => Math.max(0, Math.round(Number(v) || 0));

// スタッフ個人の月間目標（店舗×月）を設定
export async function setStaffGoal(args: {
  memberId: string;
  storeId: string;
  month: string; // 'YYYY-MM'
  newSalesTarget: number;
  newContractRateTarget: number;
  productTarget: number;
  existingSalesTarget: number;
}) {
  const actor = await assertGoalsManager();
  if (!/^\d{4}-\d{2}$/.test(args.month)) throw new Error("月の形式が不正です");
  await assertCanManageStore(actor, args.storeId);
  const admin = createAdminClient();
  const { error } = await admin.from("staff_goals").upsert(
    {
      member_id: args.memberId,
      store_id: args.storeId,
      month: args.month,
      new_sales_target: num(args.newSalesTarget),
      new_contract_rate_target: Math.min(100, num(args.newContractRateTarget)),
      product_target: num(args.productTarget),
      existing_sales_target: num(args.existingSalesTarget),
    },
    { onConflict: "member_id,store_id,month" }
  );
  if (error) throw new Error(error.message);
  await logAudit(actor, "staff_goal.set", "staff_goal", args.memberId, { storeId: args.storeId, month: args.month });
  revalidatePath("/admin/goals");
  revalidatePath("/");
}

// 店舗の月間目標（売上・1日新規・1日契約）を設定
export async function setStoreTargets(args: {
  storeId: string;
  monthlyTargetRevenue: number;
  dailyTargetNew: number;
  dailyTargetContract: number;
}) {
  const actor = await assertGoalsManager();
  await assertCanManageStore(actor, args.storeId);
  const admin = createAdminClient();
  const { error } = await admin
    .from("stores")
    .update({
      monthly_target_revenue: num(args.monthlyTargetRevenue),
      daily_target_new: num(args.dailyTargetNew),
      daily_target_contract: num(args.dailyTargetContract),
    })
    .eq("id", args.storeId);
  if (error) throw new Error(error.message);
  await logAudit(actor, "store.targets_set", "store", args.storeId, {
    monthlyTargetRevenue: num(args.monthlyTargetRevenue),
  });
  revalidatePath("/admin/goals");
  revalidatePath("/");
}
