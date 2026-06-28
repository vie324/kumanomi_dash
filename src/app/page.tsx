import Link from "next/link";
import { TrendingUp, UserPlus, Target, CalendarCheck, ShoppingBag, Sparkles, Repeat, Coins } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadPageAccess } from "@/lib/admin-guard";
import {
  monthJST,
  shiftMonth,
  nextMonthStart,
  daysInMonth,
  dayOfMonthJST,
  formatMonthLabel,
} from "@/lib/date";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import PermissionDenied from "@/components/PermissionDenied";
import DashboardCharts from "@/components/DashboardCharts";
import StoreFilter from "@/components/StoreFilter";
import DeptFilter from "@/components/DeptFilter";
import PeriodFilter from "@/components/PeriodFilter";
import KpiCard from "@/components/KpiCard";
import { isOwnOnly } from "@/lib/permissions";
import { type DailyReport, type Genre, type Member, type StaffGoal, type Store } from "@/lib/types";

export const dynamic = "force-dynamic";

function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

// 前月比（%）。前期間が0なら比較不可で null。
function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return cur > 0 ? null : 0;
  return ((cur - prev) / prev) * 100;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { store?: string; dept?: string; month?: string };
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

  // 集計期間（月）。?month=YYYY-MM。未来月は不可、既定は今月。
  const thisMonth = monthJST();
  const selectedMonth =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) && searchParams.month <= thisMonth
      ? searchParams.month
      : thisMonth;
  const isCurrentMonth = selectedMonth === thisMonth;
  const monthStart = selectedMonth + "-01";
  const monthEnd = nextMonthStart(selectedMonth);

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

  // 選択月の日報（上限日付を入れて未来月の混入を防ぐ）
  let reportsQuery = supabase
    .from("daily_reports")
    .select("*")
    .gte("report_date", monthStart)
    .lt("report_date", monthEnd)
    .order("report_date", { ascending: true });
  if (ownOnly) reportsQuery = reportsQuery.eq("member_id", member.id);
  else if (scopeStoreIds) reportsQuery = reportsQuery.in("store_id", scopeStoreIds);
  const { data: reportRows } = await reportsQuery;
  const reports = (reportRows as DailyReport[]) || [];

  // メンバー一覧: スコープ店舗の所属者に加え、日報に出てくる作成者（ヘルプ勤務の
  // 他店所属メンバー）も含める。これで「メンバー別」表と合計KPIが一致する。
  const reportMemberIds = Array.from(new Set(reports.map((r) => r.member_id)));
  let members: Member[] = [];
  if (ownOnly) {
    const { data } = await supabase.from("members").select("*").eq("id", member.id);
    members = (data as Member[]) || [];
  } else {
    const seen = new Set<string>();
    const collected: Member[] = [];
    // スコープ店舗の在籍メンバー
    {
      let q = supabase.from("members").select("*").eq("active", true);
      if (scopeStoreIds) q = q.in("store_id", scopeStoreIds);
      const { data } = await q;
      for (const m of (data as Member[]) || []) {
        if (!seen.has(m.id)) { seen.add(m.id); collected.push(m); }
      }
    }
    // 日報の作成者で未取得の者（ヘルプ勤務など）
    const missing = reportMemberIds.filter((id) => !seen.has(id));
    if (missing.length > 0) {
      const { data } = await supabase.from("members").select("*").in("id", missing);
      for (const m of (data as Member[]) || []) {
        if (!seen.has(m.id)) { seen.add(m.id); collected.push(m); }
      }
    }
    members = collected;
  }

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
  const wonAmountByMember = new Map<string, number>();
  for (const w of wonMemos) {
    wonByReport.set(w.report_id, (wonByReport.get(w.report_id) || 0) + 1);
    wonByMember.set(w.member_id, (wonByMember.get(w.member_id) || 0) + 1);
    wonAmountByMember.set(w.member_id, (wonAmountByMember.get(w.member_id) || 0) + Number(w.amount || 0));
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
  // 率は 0..100 にクランプ（入力不整合で 100% 超を表示しない）
  const conversion = sumNew > 0 ? Math.min(100, (sumContract / sumNew) * 100) : 0;
  const resvRate = sumExisting > 0 ? Math.min(100, (sumNextResv / sumExisting) * 100) : 0;
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

  // ---- 個人目標（選択月）と達成状況 ----
  // 新規売上 = 新規契約金額 + 新規体験 + 新規物販 / 既存売上 = 継続 + 物販 + その他
  // storeId 指定時はその店舗の計上分のみで集計（目標は店舗×月のため、
  // ヘルプ勤務で複数店舗に計上があるメンバーでも目標店舗の実績と突き合わせる）。
  function memberActuals(mid: string, storeId?: string) {
    const rs = reports.filter((r) => r.member_id === mid && (!storeId || r.store_id === storeId));
    const sum = (f: (r: DailyReport) => number) => rs.reduce((s, r) => s + f(r), 0);
    // 契約金額は memo を店舗で絞って再集計（wonAmountByMember は全店舗合算のため）
    const wonAmt = storeId
      ? memoRows
          .filter((m) => m.outcome === "won" && m.member_id === mid && rs.some((r) => r.id === m.report_id))
          .reduce((s, m) => s + Number(m.amount || 0), 0)
      : wonAmountByMember.get(mid) || 0;
    const newProduct = sum((r) => Number(r.new_product_sales || 0));
    const newTrial = sum((r) => Number(r.new_trial_amount || 0));
    const product = sum((r) => Number(r.product_sales || 0));
    const renewal = sum((r) => Number(r.renewal_sales || 0));
    const other = sum((r) => Number(r.other_amount || 0));
    const nw = sum((r) => r.new_count || 0);
    const contract = storeId
      ? memoRows.filter((m) => m.outcome === "won" && m.member_id === mid && rs.some((r) => r.id === m.report_id)).length
      : wonByMember.get(mid) || 0;
    return {
      newSales: wonAmt + newTrial + newProduct,
      existingSales: renewal + product + other,
      product: product + newProduct,
      contractRate: nw > 0 ? Math.min(100, (contract / nw) * 100) : 0,
    };
  }

  const goalMemberIds = members.map((m) => m.id);
  const goalsByMember = new Map<string, StaffGoal>();
  if (goalMemberIds.length > 0) {
    const { data: goalRows } = await supabase
      .from("staff_goals")
      .select("*")
      .eq("month", selectedMonth)
      .in("member_id", goalMemberIds);
    // 同一メンバーが複数店舗の目標を持つ場合の優先度:
    //   選択中の店舗 > メンバーの所属店舗 > それ以外（最初に見つかったもの）
    const memberHomeStore = new Map(members.map((m) => [m.id, m.store_id]));
    const goalScore = (g: StaffGoal) =>
      (selectedStore && g.store_id === selectedStore ? 2 : 0) +
      (g.store_id === memberHomeStore.get(g.member_id) ? 1 : 0);
    for (const g of (goalRows as StaffGoal[]) || []) {
      const cur = goalsByMember.get(g.member_id);
      if (!cur || goalScore(g) > goalScore(cur)) goalsByMember.set(g.member_id, g);
    }
  }

  // 進捗カード用（4指標）。pct は 0..100 にクランプ。
  const pct = (actual: number, target: number) =>
    target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : null;
  function goalProgressFor(mid: string) {
    const g = goalsByMember.get(mid);
    if (!g) return null;
    const a = memberActuals(mid, g.store_id);
    return [
      { key: "newSales", label: "新規売上", actual: a.newSales, target: Number(g.new_sales_target || 0), fmt: "yen" as const },
      { key: "contractRate", label: "新規契約率", actual: Math.round(a.contractRate), target: Number(g.new_contract_rate_target || 0), fmt: "pct" as const },
      { key: "product", label: "物販", actual: a.product, target: Number(g.product_target || 0), fmt: "yen" as const },
      { key: "existingSales", label: "既存売上", actual: a.existingSales, target: Number(g.existing_sales_target || 0), fmt: "yen" as const },
    ];
  }

  // ログイン中メンバー本人の進捗（個人）
  const personalProgress = goalProgressFor(member.id);

  // 前月の合計（前月比バッジ用）
  async function loadMonthTotals(month: string) {
    const mStart = month + "-01";
    const mEnd = nextMonthStart(month);
    let q = supabase
      .from("daily_reports")
      .select("id, revenue, new_count")
      .gte("report_date", mStart)
      .lt("report_date", mEnd);
    if (ownOnly) q = q.eq("member_id", member.id);
    else if (scopeStoreIds) q = q.in("store_id", scopeStoreIds);
    const { data } = await q;
    const rows = (data as { id: string; revenue: number; new_count: number }[]) || [];
    const revenue = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
    const nw = rows.reduce((s, r) => s + (r.new_count || 0), 0);
    let contract = 0;
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      const { data: mm } = await supabase
        .from("contract_memos")
        .select("report_id")
        .eq("outcome", "won")
        .in("report_id", ids);
      contract = (mm as unknown[] | null)?.length || 0;
    }
    return { revenue, new: nw, contract };
  }
  const prev = await loadMonthTotals(shiftMonth(selectedMonth, -1));
  const dRevenue = pctDelta(totalRevenue, prev.revenue);
  const dNew = pctDelta(sumNew, prev.new);

  // 月末着地予測（当月のみ。経過日数からのペーシング）
  const elapsed = isCurrentMonth ? dayOfMonthJST() : daysInMonth(selectedMonth);
  const dim = daysInMonth(selectedMonth);
  const projectedRevenue = elapsed > 0 ? Math.round((totalRevenue / elapsed) * dim) : totalRevenue;
  const projectedPct = monthlyTarget > 0 ? (projectedRevenue / monthlyTarget) * 100 : 0;

  // 店舗別ランキング（複数店舗が対象のとき）
  const showStoreRanking = !ownOnly && scopeStores.length > 1;
  const storeRanking = showStoreRanking
    ? (() => {
        const byStore = new Map<string, { revenue: number; new: number; contract: number }>();
        for (const r of reports) {
          const cur = byStore.get(r.store_id) || { revenue: 0, new: 0, contract: 0 };
          cur.revenue += Number(r.revenue || 0);
          cur.new += r.new_count || 0;
          cur.contract += wonByReport.get(r.id) || 0;
          byStore.set(r.store_id, cur);
        }
        return scopeStores
          .map((s) => ({ id: s.id, name: s.name, ...(byStore.get(s.id) || { revenue: 0, new: 0, contract: 0 }) }))
          .sort((a, b) => b.revenue - a.revenue);
      })()
    : [];

  return (
    <>
      <AppHeader member={member} store={store} active="/" />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">
              {isCurrentMonth ? "今月のダッシュボード" : `${formatMonthLabel(selectedMonth)}のダッシュボード`}
            </h1>
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
            <PeriodFilter current={selectedMonth} />
            {seesAllStores && <DeptFilter current={dept} />}
            {!ownOnly && <StoreFilter stores={scopeStores} current={selectedStore ?? "all"} />}
            <Link href="/reports/new" className="btn-primary !py-2">日報入力</Link>
          </div>
        </div>

        {/* KPI（前月比つき） */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard index={0} label="売上" value={totalRevenue} format="yen" delta={dRevenue} sub={monthlyTarget ? `目標 ${yen(monthlyTarget)}` : undefined} tone="brand" icon={<TrendingUp size={16} />} />
          <KpiCard index={1} label="新規" value={sumNew} delta={dNew} sub={`契約 ${sumContract} 件`} tone="blue" icon={<UserPlus size={16} />} />
          <KpiCard index={2} label="新規→契約率" value={conversion} format="fixed0" suffix="%" tone="emerald" icon={<Target size={16} />} />
          <KpiCard index={3} label="次回予約率" value={resvRate} format="fixed0" suffix="%" sub={`既存 ${sumExisting} 件`} tone="purple" icon={<CalendarCheck size={16} />} />
        </div>

        {/* エステ追加KPI */}
        {showEstheKpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard index={0} label="物販売上" value={sumProduct} format="yen" tone="orange" icon={<ShoppingBag size={16} />} />
            <KpiCard index={1} label="新規物販売上" value={sumNewProduct} format="yen" tone="blue" icon={<Sparkles size={16} />} />
            <KpiCard index={2} label="継続契約" value={sumRenewal} suffix="件" tone="emerald" icon={<Repeat size={16} />} />
            <KpiCard index={3} label="その他" value={sumOther} format="yen" tone="slate" icon={<Coins size={16} />} />
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
              <div className="h-full rounded-full bg-gradient-to-r from-sise-400 to-sise-600 animate-grow-x" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {totalRevenue >= monthlyTarget
                ? `目標達成（+${yen(totalRevenue - monthlyTarget)}）`
                : `目標まで ${yen(monthlyTarget - totalRevenue)}`}
            </p>
            {/* 月末着地予測（ペーシング） */}
            {monthlyTarget > 0 && elapsed > 0 && elapsed < dim && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-slate-500">
                  着地予測{" "}
                  <span className="font-bold text-slate-800">{yen(projectedRevenue)}</span>
                  <span className="text-slate-400">（{elapsed}/{dim}日 経過）</span>
                </div>
                <span
                  className={`chip ${
                    projectedPct >= 100
                      ? "bg-emerald-100 text-emerald-700"
                      : projectedPct >= 80
                      ? "bg-amber-100 text-amber-700"
                      : "bg-rose-100 text-rose-600"
                  }`}
                >
                  {projectedPct >= 100 ? "達成ペース" : `目標比 ${projectedPct.toFixed(0)}%`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 個人目標 進捗（本人の目標が設定されているとき） */}
        {personalProgress && (
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800">
                個人目標 進捗（{member.name} さん）
              </h2>
              <span className="text-[11px] text-slate-400">{formatMonthLabel(selectedMonth)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {personalProgress.map((p) => {
                const ratio = pct(p.actual, p.target);
                const actualLabel = p.fmt === "yen" ? yen(p.actual) : `${p.actual}%`;
                const targetLabel =
                  p.target > 0 ? (p.fmt === "yen" ? yen(p.target) : `${p.target}%`) : "未設定";
                return (
                  <div key={p.key}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-600">{p.label}</span>
                      <span className="text-xs text-slate-500">
                        <span className="font-bold text-slate-800">{actualLabel}</span>
                        <span className="text-slate-400"> / {targetLabel}</span>
                        {ratio != null && (
                          <span className={`ml-1.5 font-bold ${ratio >= 100 ? "text-emerald-600" : "text-sise-600"}`}>
                            {ratio}%
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${ratio != null && ratio >= 100 ? "bg-emerald-500" : "bg-gradient-to-r from-sise-400 to-sise-600"}`}
                        style={{ width: `${ratio ?? 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 店舗別ランキング */}
        {showStoreRanking && storeRanking.length > 0 && (
          <div className="glass-card card-hover p-5 animate-fade-in-up">
            <h2 className="text-sm font-bold text-slate-800 mb-3">店舗別ランキング（{formatMonthLabel(selectedMonth)}）</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="py-2 pr-3 font-semibold">#</th>
                    <th className="py-2 pr-3 font-semibold">店舗</th>
                    <th className="py-2 px-2 font-semibold text-right">売上</th>
                    <th className="py-2 px-2 font-semibold text-center">新規</th>
                    <th className="py-2 px-2 font-semibold text-center">契約</th>
                  </tr>
                </thead>
                <tbody>
                  {storeRanking.map((s, i) => (
                    <tr key={s.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-3 font-bold text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="py-2.5 pr-3 font-semibold text-slate-700">
                        {i === 0 && <span className="mr-1">🏆</span>}{s.name}
                      </td>
                      <td className="py-2.5 px-2 text-right font-bold text-sise-600">{yen(s.revenue)}</td>
                      <td className="py-2.5 px-2 text-center text-blue-600 font-semibold">{s.new}</td>
                      <td className="py-2.5 px-2 text-center text-emerald-600 font-semibold">{s.contract}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* トレンド */}
        <DashboardCharts trend={trend} accent={showEstheKpis ? "#97796d" : "#f97316"} />

        {/* メンバー別 */}
        <div className="glass-card card-hover p-5 animate-fade-in-up">
          <h2 className="text-sm font-bold text-slate-800 mb-3">メンバー別 成績（{formatMonthLabel(selectedMonth)}）</h2>
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

        {/* スタッフ別 目標進捗（責任者向け） */}
        {!ownOnly && members.some((m) => goalsByMember.has(m.id)) && (
          <div className="glass-card card-hover p-5 animate-fade-in-up">
            <h2 className="text-sm font-bold text-slate-800 mb-3">スタッフ別 目標進捗（{formatMonthLabel(selectedMonth)}）</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="py-2 pr-3 font-semibold">スタッフ</th>
                    <th className="py-2 px-2 font-semibold text-right">新規売上</th>
                    <th className="py-2 px-2 font-semibold text-right">新規契約率</th>
                    <th className="py-2 px-2 font-semibold text-right">物販</th>
                    <th className="py-2 px-2 font-semibold text-right">既存売上</th>
                  </tr>
                </thead>
                <tbody>
                  {members
                    .filter((m) => goalsByMember.has(m.id))
                    .map((m) => {
                      const prog = goalProgressFor(m.id)!;
                      return (
                        <tr key={m.id} className="border-b border-slate-50">
                          <td className="py-2.5 pr-3 font-semibold text-slate-700">{m.name}</td>
                          {prog.map((p) => {
                            const ratio = pct(p.actual, p.target);
                            const actualLabel = p.fmt === "yen" ? yen(p.actual) : `${p.actual}%`;
                            return (
                              <td key={p.key} className="py-2.5 px-2 text-right">
                                <div className="font-semibold text-slate-700 tabular-nums">{actualLabel}</div>
                                {ratio != null ? (
                                  <div className={`text-[11px] font-bold ${ratio >= 100 ? "text-emerald-600" : "text-sise-600"}`}>{ratio}%</div>
                                ) : (
                                  <div className="text-[11px] text-slate-300">目標未設定</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 媒体別 契約状況（今月） */}
        <div className="glass-card card-hover p-5 animate-fade-in-up">
          <h2 className="text-sm font-bold text-slate-800 mb-3">媒体別 契約状況（{formatMonthLabel(selectedMonth)}）</h2>
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
