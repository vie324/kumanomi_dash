import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadPageAccess } from "@/lib/admin-guard";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import PermissionDenied from "@/components/PermissionDenied";
import {
  contractLabel,
  type AiFeedback,
  type ContractMemo,
  type DailyReport,
  type Store,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function yen(n: number | null | undefined): string {
  return "¥" + Math.round(Number(n || 0)).toLocaleString("ja-JP");
}

function Stat({ label, value, accent = "text-slate-900" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="glass-card p-3 text-center">
      <p className="text-[10px] text-slate-500 mb-1">{label}</p>
      <p className={`text-lg font-extrabold ${accent}`}>{value}</p>
    </div>
  );
}

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const access = await loadPageAccess("daily_reports");
  if (!access.member) return <NoAccess />;
  const { member } = access;

  const supabase = createClient();
  const { data: storeRow } = await supabase.from("stores").select("*").eq("id", member.store_id).maybeSingle();
  const store = (storeRow as Store) ?? null;

  if (!access.allowed) {
    return <PermissionDenied member={member} store={store} message="日報の閲覧権限がありません。" />;
  }

  // RLS により、閲覧できない（スコープ外・他人）の日報は取得できない。
  const { data: reportRow } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!reportRow) {
    return (
      <>
        <AppHeader member={member} store={store} active="/reports" />
        <main className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-sm text-slate-500 mb-4">この日報は表示できません（存在しないか、閲覧権限がありません）。</p>
          <Link href="/reports" className="btn-ghost">日報一覧へ</Link>
        </main>
      </>
    );
  }
  const report = reportRow as DailyReport;
  const isEsthe = member.genre === "esthe";

  const [{ data: authorRow }, { data: reportStoreRow }, { data: memoRows }, { data: fbRow }] = await Promise.all([
    supabase.from("members").select("name").eq("id", report.member_id).maybeSingle(),
    supabase.from("stores").select("name").eq("id", report.store_id).maybeSingle(),
    supabase.from("contract_memos").select("*").eq("report_id", report.id).order("created_at", { ascending: true }),
    supabase.from("ai_feedback").select("*").eq("report_id", report.id).maybeSingle(),
  ]);
  const authorName = (authorRow as { name: string } | null)?.name ?? "—";
  const reportStoreName = (reportStoreRow as { name: string } | null)?.name ?? report.store_id;
  const memos = (memoRows as ContractMemo[]) || [];
  const fb = (fbRow as AiFeedback) || null;
  const won = memos.filter((m) => m.outcome === "won");

  return (
    <>
      <AppHeader member={member} store={store} active="/reports" />
      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <Link href="/reports" className="text-xs text-slate-500 hover:text-slate-800">← 日報一覧</Link>

        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{report.report_date} の日報</h1>
          <p className="text-xs text-slate-500 mt-1">{authorName} さん ・ {reportStoreName}</p>
        </div>

        {/* 基本数値 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="個人売上" value={yen(report.revenue)} accent="text-sise-600" />
          <Stat label="施術数(既存)" value={String(report.existing_treatments)} accent="text-orange-600" />
          <Stat label="次回予約" value={String(report.next_reservations)} accent="text-emerald-600" />
          <Stat label="新規" value={String(report.new_count)} accent="text-blue-600" />
          <Stat label="2回目予約" value={String(report.second_visit_reservations)} accent="text-emerald-600" />
          <Stat label="契約" value={`${won.length} 件`} accent="text-emerald-600" />
        </div>

        {/* エステ追加項目 */}
        {isEsthe && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="物販売上" value={yen(report.product_sales)} accent="text-orange-600" />
            <Stat label="新規物販売上" value={yen(report.new_product_sales)} accent="text-blue-600" />
            <Stat label="継続契約" value={`${report.renewal_contracts} 件`} accent="text-emerald-600" />
            <Stat label="その他" value={yen(report.other_amount)} accent="text-slate-600" />
          </div>
        )}

        {/* 契約メモ */}
        {memos.length > 0 && (
          <div className="glass-card p-4 space-y-2">
            <h2 className="text-sm font-bold text-slate-800">新規のお客様ごとの契約記録</h2>
            {memos.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl border p-3 ${m.outcome === "won" ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${m.outcome === "won" ? "text-emerald-700" : "text-rose-700"}`}>
                    {m.outcome === "won" ? "✓ 契約あり" : "✗ 契約なし"}
                  </span>
                  <span className="text-[11px] text-slate-400">{m.channel || "媒体未設定"}</span>
                </div>
                <div className="text-sm font-semibold text-slate-700">
                  {m.customer_name || "お客様"}{m.customer_attr ? `（${m.customer_attr}）` : ""}
                </div>
                {m.outcome === "won" && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {(m.menu_label || contractLabel(m)) || "内容未設定"}
                    {m.menu_sessions ? ` ・ ${m.menu_sessions}回` : ""}
                    {m.amount ? ` ・ ${yen(m.amount)}` : ""}
                  </p>
                )}
                {m.reason && <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">理由：{m.reason}</p>}
              </div>
            ))}
          </div>
        )}

        {/* 振り返り・明日の行動 */}
        {(report.reflection || report.tomorrow_action || report.other_note) && (
          <div className="glass-card p-4 space-y-3">
            {report.reflection && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">今日の振り返り</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{report.reflection}</p>
              </div>
            )}
            {report.tomorrow_action && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">明日の行動</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{report.tomorrow_action}</p>
              </div>
            )}
            {report.other_note && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">その他メモ</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{report.other_note}</p>
              </div>
            )}
          </div>
        )}

        {/* AIフィードバック */}
        {fb && (
          <div className="rounded-2xl border border-sise-200 bg-gradient-to-br from-sise-50 to-white p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-grid place-items-center w-7 h-7 rounded-lg bg-sise-500 text-white text-sm font-bold">AI</span>
              <h2 className="text-sm font-extrabold text-slate-900">AIフィードバック</h2>
            </div>
            {fb.summary && <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{fb.summary}</p>}
            {fb.issues && (
              <div>
                <p className="text-xs font-bold text-rose-600 mb-0.5">課題・未達の原因</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{fb.issues}</p>
              </div>
            )}
            {fb.advice && (
              <div>
                <p className="text-xs font-bold text-sise-600 mb-0.5">改善アクション</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{fb.advice}</p>
              </div>
            )}
            {fb.encouragement && (
              <div>
                <p className="text-xs font-bold text-emerald-600 mb-0.5">振り返り</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{fb.encouragement}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
