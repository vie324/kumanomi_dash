import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadPageAccess } from "@/lib/admin-guard";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import PermissionDenied from "@/components/PermissionDenied";
import DashboardCharts from "@/components/DashboardCharts";
import StoreFilter from "@/components/StoreFilter";
import DeptFilter from "@/components/DeptFilter";
import { isOwnOnly } from "@/lib/permissions";
import { type DailyReport, type Genre, type Member, type Store } from "@/lib/types";

export const dynamic = "force-dynamic";

function monthStartJST(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}-01`;
}

function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

function Kpi({
  label,
  value,
  sub,
  accent = "text-slate-900",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="glass-card p-4">
      <p className="text-[11px] text-slate-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-extrabold ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { store?: string; dept?: string };
}) {
  const access = await loadPageAccess("dashboard");
  if (!access.member) return <NoAccess />;
  const { member, storeIds } = access;

  const supabase = createClient();
  const { data: storeRow } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();
  const store = (storeRow as Store) ?? null;

  if (!access.allowed) {
    return <PermissionDenied member={member} store={store} message="ダッシュボードの閲覧権限がありません。" />;
  }

  // 全社が見えるか（owner 等。スコープが全店）→ 部門(全体/整骨/美容)切替を出す
  const seesAllStores = storeIds === null;
  // ?dept= による業態フィルタ（全社が見えるユーザーのみ有効）
  const dept: "all" | Genre =
    seesAllStores && (searchParams.dept === "seitai" || searchParams.dept === "esthe")
      ? (searchParams.dept as Genre)
      : "all";

  // スタッフ（自分のみ）かどうか。自分の数値だけ表示する。
  const ownOnly = isOwnOnly(member, "daily_reports");

  // スコープ内の店舗一覧（店舗フィルタ用）。部門選択時は業態で絞る。
  let scopeStores: Store[] = [];
  {
    let q = supabase.from("stores").select("*").eq("active", true).order("name", { ascending: true });
    if (storeIds) q = q.in("id", storeIds);
    if (dept !== "all") q = q.eq("genre", dept);
    const { data } = await q;
    scopeStores = (data as Store[]) || [];
  }

  // ?store= が指定され、かつ（現部門の）スコープ内ならその店舗に絞る
  const selectedStore =
    searchParams.store && scopeStores.some((s) => s.id === searchParams.store)
      ? searchParams.store
      : null;

  // 対象店舗ID: 店舗選択 > 部門の店舗群 > スコープ全店
  const scopeStoreIds = selectedStore
    ? [selectedStore]
    : dept !== "all"
    ? scopeStores.map((s) => s.id)
    : storeIds ?? null;

  let membersQuery = supabase.from("members").select("*").eq("active", true);
  if (ownOnly) membersQuery = membersQuery.eq("id", member.id);
  else if (scopeStoreIds) membersQuery = membersQuery.in("store_id", scopeStoreIds);
  const { data: membersRows } = await membersQuery;
  const members = (membersRows as Member[]) || [];

  let reportsQuery = supabase
    .from("daily_reports")
    .select("*")
    .gte("report_date", monthStartJST())
    .order("report_date", { ascending: true });
  if (ownOnly) reportsQuery = reportsQuery.eq("member_id", member.id);
  else if (scopeStoreIds) reportsQuery = reportsQuery.in("store_id", scopeStoreIds);
  const { data: reportRows } = await reportsQuery;
  const reports = (reportRows as DailyReport[]) || [];

  // 契約メモ（媒体別集計のため won/lost 両方取得）
  const reportIds = reports.map((r) => r.id);
  type MemoRow = {
    report_id: string;
    member_id: string;
    outcome: "won" | "lost";
    channel: string | null;
    amount: number | null;
  };
  let memoRows: MemoRow[] = [];
  if (reportIds.length > 0) {
    const { data } = await supabase
      .from("contract_memos")
      .select("report_id, member_id, outcome, channel, amount")
      .in("report_id", reportIds);
    memoRows = (data as MemoRow[]) || [];
  }
  const wonMemos = memoRows.filter((m) => m.outcome === "won");
  const wonByReport = new Map<string, number>();
  const wonByMember = new Map<string, number>();
  for (const w of wonMemos) {
    wonByReport.set(w.report_id, (wonByReport.get(w.report_id) || 0) + 1);
    wonByMember.set(w.member_id, (wonByMember.get(w.member_id) || 0) + 1);
  }

  // 媒体別の契約あり/なし集計（金額合計も）
  const channelStats = new Map<string, { won: number; lost: number; amount: number }>();
  for (const m of memoRows) {
    const key = m.channel || "未設定";
    const cur = channelStats.get(key) || { won: 0, lost: 0, amount: 0 };
    if (m.outcome === "won") cur.won += 1;
    else cur.lost += 1;
    cur.amount += Number(m.amount || 0);
    channelStats.set(key, cur);
  }
  const channelRows = Array.from(channelStats.entries())
    .map(([name, v]) => ({
      name,
      won: v.won,
      lost: v.lost,
      total: v.won + v.lost,
      rate: v.won + v.lost > 0 ? (v.won / (v.won + v.lost)) * 100 : 0,
      amount: v.amount,
    }))
    .sort((a, b) => b.won - a.won || b.total - a.total);
  const channelHasAmount = channelRows.some((c) => c.amount > 0);

  // 集計
  const totalRevenue = reports.reduce((s, r) => s + Number(r.revenue || 0), 0);
  const sumNew = reports.reduce((s, r) => s + (r.new_count || 0), 0);
  const sumExisting = reports.reduce((s, r) => s + (r.existing_treatments || 0), 0);
  const sumNextResv = reports.reduce((s, r) => s + (r.next_reservations || 0), 0);
  const sumContract = wonMemos.length;
  // エステ追加項目の集計
  const sumProduct = reports.reduce((s, r) => s + Number(r.product_sales || 0), 0);
  const sumNewProduct = reports.reduce((s, r) => s + Number(r.new_product_sales || 0), 0);
  const sumRenewal = reports.reduce((s, r) => s + (r.renewal_contracts || 0), 0);
  const sumOther = reports.reduce((s, r) => s + Number(r.other_amount || 0), 0);
  // 美容業態の指標を出すか（部門=美容、または本人がエステ）
  const showEstheKpis = dept === "esthe" || (dept === "all" && member.genre === "esthe");
  const conversion = sumNew > 0 ? (sumContract / sumNew) * 100 : 0;
  const resvRate = sumExisting > 0 ? (sumNextResv / sumExisting) * 100 : 0;
  const monthlyTarget = store?.monthly_target_revenue || 0;
  const progress = monthlyTarget > 0 ? Math.min(100, (totalRevenue / monthlyTarget) * 100) : 0;

  // 日次トレンド
  const byDate = new Map<string, { date: string; revenue: number; new: number; contract: number }>();
  for (const r of reports) {
    const cur = byDate.get(r.report_date) || { date: r.report_date, revenue: 0, new: 0, contract: 0 };
    cur.revenue += Number(r.revenue || 0);
    cur.new += r.new_count || 0;
    cur.contract += wonByReport.get(r.id) || 0;
    byDate.set(r.report_date, cur);
  }
  const trend = Array.from(byDate.values()).map((d) => ({
    date: d.date.slice(5),
    revenue: d.revenue,
    new: d.new,
    contract: d.contract,
  }));

  // メンバー別
  const perMember = members
    .map((m) => {
      const rs = reports.filter((r) => r.member_id === m.id);
      return {
        id: m.id,
        name: m.name,
        revenue: rs.reduce((s, r) => s + Number(r.revenue || 0), 0),
        new: rs.reduce((s, r) => s + (r.new_count || 0), 0),
        contract: wonByMember.get(m.id) || 0,
        count: rs.length,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return (
    <>
      <AppHeader member={member} store={store} active="/" />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">今月のダッシュボード</h1>
            <p className="text-xs text-slate-500">
              {ownOnly
                ? `${member.name} さん（自分）`
                : selectedStore
                ? scopeStores.find((s) => s.id === selectedStore)?.name
                : dept === "seitai"
                ? "整骨 部門"
                : dept === "esthe"
                ? "美容 部門"
                : seesAllStores
                ? "全体"
                : "全店舗（部門内）"}{" "}
              ・ {reports.length}件の日報
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {seesAllStores && <DeptFilter current={dept} />}
            {!ownOnly && <StoreFilter stores={scopeStores} current={selectedStore ?? "all"} />}
            <Link href="/reports/new" className="btn-primary !py-2">日報入力</Link>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="今月売上" value={yen(totalRevenue)} sub={monthlyTarget ? `目標 ${yen(monthlyTarget)}` : undefined} accent="text-sise-600" />
          <Kpi label="新規" value={String(sumNew)} sub={`契約 ${sumContract} 件`} accent="text-blue-600" />
          <Kpi label="新規→契約率" value={`${conversion.toFixed(0)}%`} accent="text-emerald-600" />
          <Kpi label="次回予約率" value={`${resvRate.toFixed(0)}%`} sub={`既存 ${sumExisting} 件`} accent="text-purple-600" />
        </div>

        {/* エステ追加KPI */}
        {showEstheKpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="物販売上" value={yen(sumProduct)} accent="text-orange-600" />
            <Kpi label="新規物販売上" value={yen(sumNewProduct)} accent="text-blue-600" />
            <Kpi label="継続契約" value={`${sumRenewal} 件`} accent="text-emerald-600" />
            <Kpi label="その他" value={yen(sumOther)} accent="text-slate-600" />
          </div>
        )}

        {/* 目標進捗 */}
        {monthlyTarget > 0 && (
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-slate-800">月間売上目標 進捗</h2>
              <span className="text-sm font-bold text-sise-600">{progress.toFixed(1)}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-sise-400 to-sise-600" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {totalRevenue >= monthlyTarget
                ? `目標達成（+${yen(totalRevenue - monthlyTarget)}）`
                : `目標まで ${yen(monthlyTarget - totalRevenue)}`}
            </p>
          </div>
        )}

        {/* トレンド */}
        <DashboardCharts trend={trend} />

        {/* メンバー別 */}
        <div className="glass-card p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-3">メンバー別 成績（今月）</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-3 font-semibold">メンバー</th>
                  <th className="py-2 px-2 font-semibold text-right">売上</th>
                  <th className="py-2 px-2 font-semibold text-center">新規</th>
                  <th className="py-2 px-2 font-semibold text-center">契約</th>
                  <th className="py-2 px-2 font-semibold text-center">日報数</th>
                </tr>
              </thead>
              <tbody>
                {perMember.map((m) => (
                  <tr key={m.id} className="border-b border-slate-50">
                    <td className="py-2.5 pr-3 font-semibold text-slate-700">{m.name}</td>
                    <td className="py-2.5 px-2 text-right font-bold text-sise-600">{yen(m.revenue)}</td>
                    <td className="py-2.5 px-2 text-center text-blue-600 font-semibold">{m.new}</td>
                    <td className="py-2.5 px-2 text-center text-emerald-600 font-semibold">{m.contract}</td>
                    <td className="py-2.5 px-2 text-center text-slate-500">{m.count}</td>
                  </tr>
                ))}
                {perMember.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 text-sm">
                      まだ日報がありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 媒体別 契約状況（今月） */}
        <div className="glass-card p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-3">媒体別 契約状況（今月）</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-3 font-semibold">媒体</th>
                  <th className="py-2 px-2 font-semibold text-center">契約</th>
                  <th className="py-2 px-2 font-semibold text-center">未契約</th>
                  <th className="py-2 px-2 font-semibold text-center">合計</th>
                  <th className="py-2 px-2 font-semibold text-right">成約率</th>
                  {channelHasAmount && <th className="py-2 px-2 font-semibold text-right">金額</th>}
                </tr>
              </thead>
              <tbody>
                {channelRows.map((c) => (
                  <tr key={c.name} className="border-b border-slate-50">
                    <td className="py-2.5 pr-3 font-semibold text-slate-700">{c.name}</td>
                    <td className="py-2.5 px-2 text-center text-emerald-600 font-bold">{c.won}</td>
                    <td className="py-2.5 px-2 text-center text-rose-500">{c.lost}</td>
                    <td className="py-2.5 px-2 text-center text-slate-500">{c.total}</td>
                    <td className="py-2.5 px-2 text-right font-bold text-sise-600">{c.rate.toFixed(0)}%</td>
                    {channelHasAmount && (
                      <td className="py-2.5 px-2 text-right text-slate-600">{c.amount > 0 ? yen(c.amount) : "—"}</td>
                    )}
                  </tr>
                ))}
                {channelRows.length === 0 && (
                  <tr>
                    <td colSpan={channelHasAmount ? 6 : 5} className="py-6 text-center text-slate-400 text-sm">
                      契約メモがまだありません。日報入力で媒体を記録すると集計されます。
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
