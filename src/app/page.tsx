import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import DashboardCharts from "@/components/DashboardCharts";
import {
  type DailyReport,
  type Member,
  type Store,
  totalContract,
  totalNew,
} from "@/lib/types";

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

export default async function DashboardPage() {
  const member = await getCurrentMember();
  if (!member) return <NoAccess />;

  const supabase = createClient();
  const { data: storeRow } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();
  const store = (storeRow as Store) ?? null;

  const { data: membersRows } = await supabase
    .from("members")
    .select("*")
    .eq("store_id", member.store_id)
    .eq("active", true);
  const members = (membersRows as Member[]) || [];
  const memberName = (id: string) => members.find((m) => m.id === id)?.name || "—";

  const { data: reportRows } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("store_id", member.store_id)
    .gte("report_date", monthStartJST())
    .order("report_date", { ascending: true });
  const reports = (reportRows as DailyReport[]) || [];

  // 集計
  const totalRevenue = reports.reduce((s, r) => s + Number(r.revenue || 0), 0);
  const sumNew = reports.reduce((s, r) => s + totalNew(r), 0);
  const sumContract = reports.reduce((s, r) => s + totalContract(r), 0);
  const conversion = sumNew > 0 ? (sumContract / sumNew) * 100 : 0;
  const monthlyTarget = store?.monthly_target_revenue || 0;
  const progress = monthlyTarget > 0 ? Math.min(100, (totalRevenue / monthlyTarget) * 100) : 0;

  // 日次トレンド
  const byDate = new Map<string, { date: string; revenue: number; new: number; contract: number }>();
  for (const r of reports) {
    const cur = byDate.get(r.report_date) || { date: r.report_date, revenue: 0, new: 0, contract: 0 };
    cur.revenue += Number(r.revenue || 0);
    cur.new += totalNew(r);
    cur.contract += totalContract(r);
    byDate.set(r.report_date, cur);
  }
  const trend = Array.from(byDate.values()).map((d) => ({
    date: d.date.slice(5), // MM-DD
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
        new: rs.reduce((s, r) => s + totalNew(r), 0),
        contract: rs.reduce((s, r) => s + totalContract(r), 0),
        count: rs.length,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return (
    <>
      <AppHeader member={member} store={store} active="/" />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">今月のダッシュボード</h1>
            <p className="text-xs text-slate-500">{store?.name} ・ {reports.length}件の日報</p>
          </div>
          <Link href="/reports/new" className="btn-primary !py-2">日報入力</Link>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="今月売上" value={yen(totalRevenue)} sub={monthlyTarget ? `目標 ${yen(monthlyTarget)}` : undefined} accent="text-sise-600" />
          <Kpi label="新規" value={String(sumNew)} sub="今月合計" accent="text-blue-600" />
          <Kpi label="契約" value={String(sumContract)} sub="今月合計" accent="text-emerald-600" />
          <Kpi label="新規→契約率" value={`${conversion.toFixed(0)}%`} accent="text-purple-600" />
        </div>

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
      </main>
    </>
  );
}
