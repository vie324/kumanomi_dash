import { createClient } from "@/lib/supabase/server";
import { loadPageAccess } from "@/lib/admin-guard";
import { canEdit } from "@/lib/permissions";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import MenuView from "@/components/MenuView";
import type { MenuPlan, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  // ダッシュボード閲覧権限があれば料金表も閲覧可
  const access = await loadPageAccess("dashboard");
  if (!access.member) return <NoAccess />;
  const { member, matrix } = access;

  const supabase = createClient();
  const { data: storeRow } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();
  const store = (storeRow as Store) ?? null;

  // 本人の業態のメニューを取得（全店舗共通 + 自店舗限定）
  const { data: planRows } = await supabase
    .from("menu_plans")
    .select("*")
    .eq("genre", member.genre)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const plans = ((planRows as MenuPlan[]) || []).filter(
    (p) => p.store_id === null || p.store_id === member.store_id
  );

  return (
    <>
      <AppHeader member={member} store={store} active="/menu" />
      <main className="max-w-5xl mx-auto px-4 py-5">
        <MenuView
          plans={plans}
          storeName={store?.name || ""}
          canEdit={canEdit(matrix, member, "org_admin")}
        />
      </main>
    </>
  );
}
