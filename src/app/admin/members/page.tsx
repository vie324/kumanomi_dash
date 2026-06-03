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
      supabase.from("members").select("*").order("name", { ascending: true }),
      supabase.from("stores").select("*").order("name", { ascending: true }),
      supabase.from("departments").select("*").order("name", { ascending: true }),
      supabase.from("member_store_access").select("member_id, store_id"),
    ]);

  const accessMap: Record<string, string[]> = {};
  for (const a of (access as { member_id: string; store_id: string }[]) || []) {
    (accessMap[a.member_id] ||= []).push(a.store_id);
  }

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
      </main>
    </>
  );
}
