import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin-guard";
import AppHeader from "@/components/AppHeader";
import MemberAdminTable from "@/components/admin/MemberAdminTable";
import type { Department, Member, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MembersAdminPage() {
  const guard = await requirePermission("staff_admin", "manage");
  if (!guard) {
    return (
      <main className="min-h-screen grid place-items-center px-4 bg-slate-50">
        <div className="glass-card p-7 max-w-sm text-center">
          <h1 className="text-lg font-extrabold text-slate-900 mb-2">権限がありません</h1>
          <p className="text-sm text-slate-500 mb-5">この画面（権限管理）にアクセスする権限がありません。</p>
          <Link href="/" className="btn-ghost w-full">ダッシュボードへ</Link>
        </div>
      </main>
    );
  }
  const { member } = guard;

  const supabase = createClient();
  const [{ data: storeRow }, { data: members }, { data: stores }, { data: departments }, { data: access }] =
    await Promise.all([
      supabase.from("stores").select("*").eq("id", member.store_id).maybeSingle(),
      // 無効化（ソフトデリート）済みのスタッフは一覧から除外
      supabase.from("members").select("*").eq("active", true).order("name", { ascending: true }),
      supabase.from("stores").select("*").order("name", { ascending: true }),
      supabase.from("departments").select("*").order("name", { ascending: true }),
      supabase.from("member_store_access").select("member_id, store_id"),
    ]);

  const accessMap: Record<string, string[]> = {};
  for (const a of (access as { member_id: string; store_id: string }[]) || []) {
    (accessMap[a.member_id] ||= []).push(a.store_id);
  }

  // 最近の操作監査ログ（staff_admin manage のみ閲覧可）
  type AuditRow = { id: string; actor_name: string | null; action: string; target_type: string | null; created_at: string };
  const { data: auditRows } = await supabase
    .from("audit_log")
    .select("id, actor_name, action, target_type, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  const audit = (auditRows as AuditRow[]) || [];
  const ACTION_LABELS: Record<string, string> = {
    "member.role_update": "役割・範囲を変更",
    "member.stores_set": "担当店舗を変更",
    "member.create": "スタッフを追加",
    "member.deactivate": "スタッフを無効化",
    "role_permission.update": "権限マトリクスを変更",
    "media_channel.add": "媒体を追加",
    "media_channel.update": "媒体を更新",
    "media_channel.delete": "媒体を削除",
    "menu_plan.add": "メニューを追加",
    "menu_plan.update": "メニューを更新",
    "menu_plan.delete": "メニューを削除",
  };
  const fmtTs = (iso: string) =>
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  return (
    <>
      <AppHeader member={member} store={(storeRow as Store) ?? null} active="/admin/members" showAdmin />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">スタッフ権限の割当</h1>
            <p className="text-xs text-slate-500 mt-1">各スタッフの役割・データ範囲・担当店舗を設定します。</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/media" className="btn-ghost !py-2">媒体設定 →</Link>
            <Link href="/admin/roles" className="btn-ghost !py-2">権限マトリクス →</Link>
          </div>
        </div>
        <MemberAdminTable
          members={(members as Member[]) || []}
          stores={(stores as Store[]) || []}
          departments={(departments as Department[]) || []}
          accessMap={accessMap}
          currentMemberId={member.id}
          defaultStoreId={member.store_id}
        />

        {/* 操作監査ログ（最近20件） */}
        {audit.length > 0 && (
          <details className="glass-card p-4">
            <summary className="text-sm font-bold text-slate-800 cursor-pointer">操作ログ（最近の管理操作）</summary>
            <div className="mt-3 flex flex-col gap-1">
              {audit.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-slate-400 tabular-nums w-20 shrink-0">{fmtTs(a.created_at)}</span>
                  <span className="font-semibold text-slate-700 shrink-0">{a.actor_name || "—"}</span>
                  <span className="text-slate-500">{ACTION_LABELS[a.action] || a.action}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </main>
    </>
  );
}
