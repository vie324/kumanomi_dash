import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, getPermissionMatrix } from "@/lib/auth";
import { can } from "@/lib/permissions";
import AppHeader from "@/components/AppHeader";
import MenuPlanEditor from "@/components/admin/MenuPlanEditor";
import type { MenuPlan, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MenuAdminPage() {
  const member = await getCurrentMember();
  const matrix = member ? await getPermissionMatrix() : {};
  if (!member || !can(matrix, member, "org_admin", "edit")) {
    return (
      <main className="min-h-screen grid place-items-center px-4 bg-slate-50">
        <div className="glass-card p-7 max-w-sm text-center">
          <h1 className="text-lg font-extrabold text-slate-900 mb-2">権限がありません</h1>
          <p className="text-sm text-slate-500 mb-5">料金表の編集権限（店舗・部門設定）がありません。</p>
          <Link href="/menu" className="btn-ghost w-full">料金表へ</Link>
        </div>
      </main>
    );
  }

  const supabase = createClient();
  const { data: storeRow } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();
  const store = (storeRow as Store) ?? null;

  const { data: planRows } = await supabase
    .from("menu_plans")
    .select("*")
    .eq("genre", member.genre)
    .order("section", { ascending: true })
    .order("sort_order", { ascending: true });
  const plans = ((planRows as MenuPlan[]) || []).filter(
    (p) => p.store_id === null || p.store_id === member.store_id
  );

  return (
    <>
      <AppHeader member={member} store={store} active="/menu" />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/menu" className="text-xs text-slate-500 hover:text-slate-800">← 料金表</Link>
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">料金表の編集</h1>
          <p className="text-xs text-slate-500 mt-1">
            金額・回数・区分を編集できます（{member.genre === "esthe" ? "エステ" : "整体"} / {store?.name}）。
          </p>
        </div>
        <MenuPlanEditor
          plans={plans}
          genre={member.genre}
          storeId={member.store_id}
        />
      </main>
    </>
  );
}
