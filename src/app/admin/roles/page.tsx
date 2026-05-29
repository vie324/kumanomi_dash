import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin-guard";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import RoleMatrixEditor from "@/components/admin/RoleMatrixEditor";
import type { Store } from "@/lib/types";
import type { PermLevel, Resource } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function RolesAdminPage() {
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
  const { data: storeRow } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();

  const { data: rows } = await supabase.from("role_permissions").select("role, resource, level");
  const initial: { role: string; resource: Resource; level: PermLevel }[] =
    (rows as { role: string; resource: Resource; level: PermLevel }[]) || [];

  return (
    <>
      <AppHeader member={member} store={(storeRow as Store) ?? null} active="/admin/members" showAdmin />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/admin/members" className="text-xs text-slate-500 hover:text-slate-800">← スタッフ割当</Link>
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">権限マトリクス</h1>
          <p className="text-xs text-slate-500 mt-1">役割ごとに、各機能の操作レベル（なし / 閲覧 / 編集 / 管理）を設定します。</p>
        </div>
        <RoleMatrixEditor initial={initial} />
      </main>
    </>
  );
}
