import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleStoreIds, getCurrentMember, getPermissionMatrix } from "@/lib/auth";
import { can, roleRank } from "@/lib/permissions";
import { monthJST } from "@/lib/date";
import AppHeader from "@/components/AppHeader";
import StoreFilter from "@/components/StoreFilter";
import PeriodFilter from "@/components/PeriodFilter";
import CoachingView from "@/components/CoachingView";
import type { Member, StaffCoaching, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CoachingPage({
  searchParams,
}: {
  searchParams: { store?: string; month?: string };
}) {
  const member = await getCurrentMember();
  const matrix = member ? await getPermissionMatrix() : {};
  // 店長以上 かつ スタッフ管理の閲覧権限
  if (!member || roleRank(member.role) < roleRank("store_manager") || !can(matrix, member, "staff_admin", "view")) {
    return (
      <main className="min-h-screen grid place-items-center px-4 bg-slate-50">
        <div className="glass-card p-7 max-w-sm text-center">
          <h1 className="text-lg font-extrabold text-slate-900 mb-2">権限がありません</h1>
          <p className="text-sm text-slate-500 mb-5">スタッフ指導は店長以上の責任者のみ利用できます。</p>
          <Link href="/" className="btn-ghost w-full">ダッシュボードへ</Link>
        </div>
      </main>
    );
  }

  const supabase = createClient();
  const storeIds = await getAccessibleStoreIds(member);

  let storesQuery = supabase.from("stores").select("*").eq("active", true).order("name", { ascending: true });
  if (storeIds) storesQuery = storesQuery.in("id", storeIds);
  const { data: storeRows } = await storesQuery;
  const stores = (storeRows as Store[]) || [];

  const selectedStoreId =
    (searchParams.store && stores.some((s) => s.id === searchParams.store) && searchParams.store) ||
    (stores.some((s) => s.id === member.store_id) ? member.store_id : stores[0]?.id);
  const store = stores.find((s) => s.id === selectedStoreId) ?? null;

  const headerStore = (await supabase.from("stores").select("*").eq("id", member.store_id).maybeSingle())
    .data as Store | null;

  const thisMonth = monthJST();
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) && searchParams.month <= thisMonth
      ? searchParams.month
      : thisMonth;

  if (!store) {
    return (
      <>
        <AppHeader member={member} store={headerStore} active="/coaching" />
        <main className="max-w-5xl mx-auto px-4 py-5">
          <p className="text-sm text-slate-400">対象店舗がありません。</p>
        </main>
      </>
    );
  }

  const { data: memberRows } = await supabase
    .from("members")
    .select("*")
    .eq("store_id", store.id)
    .eq("active", true)
    .order("name", { ascending: true });
  const staff = ((memberRows as Member[]) || []).map((m) => ({ id: m.id, name: m.name }));

  const { data: coachingRows } = await supabase
    .from("staff_coaching")
    .select("*")
    .eq("store_id", store.id)
    .eq("month", month);
  const initial: Record<string, StaffCoaching> = {};
  for (const c of (coachingRows as StaffCoaching[]) || []) initial[c.member_id] = c;

  return (
    <>
      <AppHeader member={member} store={headerStore} active="/coaching" />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">スタッフ指導（AIコーチング）</h1>
            <p className="text-xs text-slate-500">
              スタッフごとの月間成績から、強み・課題・指導アドバイスをAIが生成します。
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PeriodFilter current={month} />
            <StoreFilter stores={stores} current={store.id} />
          </div>
        </div>
        <CoachingView key={`${store.id}-${month}`} storeId={store.id} month={month} staff={staff} initial={initial} />
      </main>
    </>
  );
}
