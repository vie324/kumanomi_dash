import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadPageAccess } from "@/lib/admin-guard";
import { isOwnOnly } from "@/lib/permissions";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import PermissionDenied from "@/components/PermissionDenied";
import StoreFilter from "@/components/StoreFilter";
import { type DailyReport, type Member, type Store } from "@/lib/types";

export const dynamic = "force-dynamic";

function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export default async function ReportsListPage({
  searchParams,
}: {
  searchParams: { store?: string };
}) {
  const access = await loadPageAccess("daily_reports");
  if (!access.member) return <NoAccess />;
  const { member, storeIds } = access;

  const supabase = createClient();
  const { data: storeRow } = await supabase.from("stores").select("*").eq("id", member.store_id).maybeSingle();
  const store = (storeRow as Store) ?? null;

  if (!access.allowed) {
    return <PermissionDenied member={member} store={store} message="日報の閲覧権限がありません。" />;
  }

  // スタッフは自分の日報のみ。それ以外はスコープ内の店舗。
  const ownOnly = isOwnOnly(member, "daily_reports");

  // スコープ内の店舗一覧（店舗フィルタ用）
  let scopeStores: Store[] = [];
  if (!ownOnly) {
    let q = supabase.from("stores").select("*").eq("active", true).order("name", { ascending: true });
    if (storeIds) q = q.in("id", storeIds);
    const { data } = await q;
    scopeStores = (data as Store[]) || [];
  }
  const selectedStore =
    searchParams.store && scopeStores.some((s) => s.id === searchParams.store)
      ? searchParams.store
      : null;
  const scopeStoreIds = selectedStore ? [selectedStore] : storeIds ?? null;

  let membersQuery = supabase.from("members").select("*");
  if (scopeStoreIds) membersQuery = membersQuery.in("store_id", scopeStoreIds);
  const { data: membersRows } = await membersQuery;
  const members = (membersRows as Member[]) || [];
  const memberName = (id: string) => members.find((m) => m.id === id)?.name || "—";

  let reportsQuery = supabase
    .from("daily_reports")
    .select("*")
    .order("report_date", { ascending: false })
    .limit(120);
  if (ownOnly) {
    reportsQuery = reportsQuery.eq("member_id", member.id);
  } else if (scopeStoreIds) {
    reportsQuery = reportsQuery.in("store_id", scopeStoreIds);
  }
  const { data: reportRows } = await reportsQuery;
  const reports = (reportRows as DailyReport[]) || [];

  // 契約(won)件数を report ごとに集計
  const reportIds = reports.map((r) => r.id);
  const wonByReport = new Map<string, number>();
  if (reportIds.length > 0) {
    const { data: memoRows } = await supabase
      .from("contract_memos")
      .select("report_id, outcome")
      .in("report_id", reportIds)
      .eq("outcome", "won");
    for (const w of (memoRows as { report_id: string }[]) || []) {
      wonByReport.set(w.report_id, (wonByReport.get(w.report_id) || 0) + 1);
    }
  }

  // AIフィードバック有無
  const { data: fbRows } = await supabase.from("ai_feedback").select("report_id");
  const fbSet = new Set((fbRows || []).map((f) => f.report_id as string));

  return (
    <>
      <AppHeader member={member} store={store} active="/reports" />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-slate-900">日報一覧</h1>
          <div className="flex items-center gap-2">
            {!ownOnly && <StoreFilter stores={scopeStores} current={selectedStore ?? "all"} />}
            <Link href="/reports/new" className="btn-primary !py-2">日報入力</Link>
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 bg-slate-50/60 border-b border-slate-100">
                  <th className="py-3 px-3 font-semibold">日付</th>
                  <th className="py-3 px-3 font-semibold">担当</th>
                  <th className="py-3 px-2 font-semibold text-right">売上</th>
                  <th className="py-3 px-2 font-semibold text-center">既存<br /><span className="font-normal text-slate-400">施術/予約</span></th>
                  <th className="py-3 px-2 font-semibold text-center">新規<br /><span className="font-normal text-slate-400">数/2回目</span></th>
                  <th className="py-3 px-2 font-semibold text-center">契約</th>
                  <th className="py-3 px-2 font-semibold text-center">AI</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-3 px-3 text-slate-600">{r.report_date}</td>
                    <td className="py-3 px-3 font-semibold text-slate-700">{memberName(r.member_id)}</td>
                    <td className="py-3 px-2 text-right font-bold text-sise-600">{yen(Number(r.revenue))}</td>
                    <td className="py-3 px-2 text-center text-slate-600">
                      <span className="text-orange-600 font-semibold">{r.existing_treatments}</span>
                      <span className="text-slate-300 mx-0.5">/</span>
                      <span className="text-emerald-600 font-semibold">{r.next_reservations}</span>
                    </td>
                    <td className="py-3 px-2 text-center text-slate-600">
                      <span className="text-blue-600 font-semibold">{r.new_count}</span>
                      <span className="text-slate-300 mx-0.5">/</span>
                      <span className="text-emerald-600 font-semibold">{r.second_visit_reservations}</span>
                    </td>
                    <td className="py-3 px-2 text-center text-emerald-600 font-bold">{wonByReport.get(r.id) || 0}</td>
                    <td className="py-3 px-2 text-center">
                      {fbSet.has(r.id) ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-sise-500" title="AIフィードバック済み" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-slate-200" />
                      )}
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400 text-sm">
                      まだ日報がありません。「日報入力」から登録してください。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
