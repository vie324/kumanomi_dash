import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleStoreIds, getCurrentMember, getPermissionMatrix } from "@/lib/auth";
import { canEdit, roleRank } from "@/lib/permissions";
import { monthJST } from "@/lib/date";
import AppHeader from "@/components/AppHeader";
import StoreFilter from "@/components/StoreFilter";
import PeriodFilter from "@/components/PeriodFilter";
import GoalEditor from "@/components/admin/GoalEditor";
import type { Member, StaffGoal, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function GoalsAdminPage({
  searchParams,
}: {
  searchParams: { store?: string; month?: string };
}) {
  const member = await getCurrentMember();
  const matrix = member ? await getPermissionMatrix() : {};
  // 店長(store_manager)以上 かつ 日報の編集権限
  if (!member || !canEdit(matrix, member, "daily_reports") || roleRank(member.role) < roleRank("store_manager")) {
    return (
      <main className="min-h-screen grid place-items-center px-4 bg-slate-50">
        <div className="glass-card p-7 max-w-sm text-center">
          <h1 className="text-lg font-extrabold text-slate-900 mb-2">権限がありません</h1>
          <p className="text-sm text-slate-500 mb-5">目標設定は店長以上の責任者のみ利用できます。</p>
          <Link href="/" className="btn-ghost w-full">ダッシュボードへ</Link>
        </div>
      </main>
    );
  }

  const supabase = createClient();
  const storeIds = await getAccessibleStoreIds(member);

  // アクセス可能な店舗一覧
  let storesQuery = supabase.from("stores").select("*").eq("active", true).order("name", { ascending: true });
  if (storeIds) storesQuery = storesQuery.in("id", storeIds);
  const { data: storeRows } = await storesQuery;
  const stores = (storeRows as Store[]) || [];

  // 対象店舗（既定=自店。無ければ先頭）
  const selectedStoreId =
    (searchParams.store && stores.some((s) => s.id === searchParams.store) && searchParams.store) ||
    (stores.some((s) => s.id === member.store_id) ? member.store_id : stores[0]?.id);
  const store = stores.find((s) => s.id === selectedStoreId) ?? null;

  const headerStore = (await supabase.from("stores").select("*").eq("id", member.store_id).maybeSingle()).data as Store | null;

  // 対象月
  const thisMonth = monthJST();
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) && searchParams.month <= thisMonth
      ? searchParams.month
      : thisMonth;

  if (!store) {
    return (
      <>
        <AppHeader member={member} store={headerStore} active="/admin/goals" />
        <main className="max-w-5xl mx-auto px-4 py-5">
          <p className="text-sm text-slate-400">対象店舗がありません。</p>
        </main>
      </>
    );
  }

  // 在籍スタッフ
  const { data: memberRows } = await supabase
    .from("members")
    .select("*")
    .eq("store_id", store.id)
    .eq("active", true)
    .order("name", { ascending: true });
  const staff = (memberRows as Member[]) || [];

  // 既存の目標
  const { data: goalRows } = await supabase
    .from("staff_goals")
    .select("*")
    .eq("store_id", store.id)
    .eq("month", month);
  const goalsByMember = new Map<string, StaffGoal>();
  for (const g of (goalRows as StaffGoal[]) || []) goalsByMember.set(g.member_id, g);

  const initialRows = staff.map((m) => {
    const g = goalsByMember.get(m.id);
    return {
      memberId: m.id,
      name: m.name,
      newSalesTarget: Number(g?.new_sales_target || 0),
      newContractRateTarget: Number(g?.new_contract_rate_target || 0),
      productTarget: Number(g?.product_target || 0),
      existingSalesTarget: Number(g?.existing_sales_target || 0),
    };
  });

  return (
    <>
      <AppHeader member={member} store={headerStore} active="/admin/goals" />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">目標設定</h1>
            <p className="text-xs text-slate-500">店舗の月間目標と、スタッフ個人の目標を設定します。</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PeriodFilter current={month} />
            <StoreFilter stores={stores} current={store.id} />
          </div>
        </div>
        <GoalEditor key={`${store.id}-${month}`} store={store} month={month} initialRows={initialRows} />
      </main>
    </>
  );
}
