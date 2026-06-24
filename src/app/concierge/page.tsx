import { createClient } from "@/lib/supabase/server";
import { loadPageAccess } from "@/lib/admin-guard";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import PermissionDenied from "@/components/PermissionDenied";
import ConciergeView from "@/components/ConciergeView";
import type { MenuPlan, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ConciergePage() {
  const access = await loadPageAccess("dashboard");
  if (!access.member) return <NoAccess />;
  const { member } = access;

  const supabase = createClient();
  const { data: storeRow } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();
  const store = (storeRow as Store) ?? null;

  // エステ専用
  if (member.genre !== "esthe") {
    return <PermissionDenied member={member} store={store} message="この機能はエステ業態専用です。" />;
  }

  const { data: menuRows } = await supabase
    .from("menu_plans")
    .select("*")
    .eq("genre", "esthe")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const menuPlans = ((menuRows as MenuPlan[]) || []).filter(
    (p) => p.store_id === null || p.store_id === member.store_id
  );

  return (
    <>
      <AppHeader member={member} store={store} active="/concierge" />
      <main className="max-w-3xl mx-auto px-4 py-5">
        <ConciergeView menuPlans={menuPlans} />
      </main>
    </>
  );
}
