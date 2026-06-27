import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember, getPermissionMatrix } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { generateFeedback } from "@/lib/ai-feedback";
import { formatMonthLabel } from "@/lib/date";
import type { ContractMemo, DailyReport, Store } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// "YYYY-MM" の日数（28〜31）
function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return 30;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// POST /api/ai-feedback  { reportId: string, force?: boolean }
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const reportId: string | undefined = body?.reportId;
    const force: boolean = !!body?.force;
    if (!reportId) {
      return NextResponse.json({ error: "reportId is required" }, { status: 400 });
    }

    // 認証チェック（ユーザーセッション）
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY が未設定です。" },
        { status: 503 }
      );
    }

    // 日報・メモを取得（RLS適用のユーザークライアントで）
    const { data: report, error: repErr } = await supabase
      .from("daily_reports")
      .select("*")
      .eq("id", reportId)
      .maybeSingle();
    if (repErr || !report) {
      return NextResponse.json({ error: "report not found" }, { status: 404 });
    }

    // 再生成(force)は有料APIを消費するため、日報の本人または manage 権限者のみ許可。
    // それ以外の閲覧者は既存フィードバックの再生成を起動できない（コスト保護）。
    const actor = await getCurrentMember();
    const matrix = await getPermissionMatrix();
    const isAuthor = !!actor && actor.id === (report as DailyReport).member_id;
    const canManage = !!actor && can(matrix, actor, "daily_reports", "manage");
    const allowForce = force && (isAuthor || canManage);

    // 既存フィードバックがあり、force が許可されていなければ返す
    if (!allowForce) {
      const { data: existing } = await supabase
        .from("ai_feedback")
        .select("*")
        .eq("report_id", reportId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ feedback: existing, cached: true });
      }
    }

    const { data: memos } = await supabase
      .from("contract_memos")
      .select("*")
      .eq("report_id", reportId);

    const { data: store } = await supabase
      .from("stores")
      .select("*")
      .eq("id", (report as DailyReport).store_id)
      .maybeSingle();

    const { data: member } = await supabase
      .from("members")
      .select("name")
      .eq("id", (report as DailyReport).member_id)
      .maybeSingle();

    // 比較コーチング用：本人の「今月の累計とペース」を算出
    const rep = report as DailyReport;
    const monthKey = rep.report_date.slice(0, 7);
    const monthStart = monthKey + "-01";
    const { data: mtdRows } = await supabase
      .from("daily_reports")
      .select("id, revenue, new_count")
      .eq("member_id", rep.member_id)
      .gte("report_date", monthStart)
      .lte("report_date", rep.report_date);
    const rows = (mtdRows as { id: string; revenue: number; new_count: number }[]) || [];
    const mtdRevenue = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
    const mtdNew = rows.reduce((s, r) => s + (r.new_count || 0), 0);
    let mtdContract = 0;
    const mtdIds = rows.map((r) => r.id);
    if (mtdIds.length > 0) {
      const { data: wonRows } = await supabase
        .from("contract_memos")
        .select("report_id")
        .eq("outcome", "won")
        .in("report_id", mtdIds);
      mtdContract = (wonRows as unknown[] | null)?.length || 0;
    }
    const daysElapsed = Number(rep.report_date.slice(8, 10)) || rows.length;
    const dim = daysInMonth(monthKey);
    const projectedRevenue = daysElapsed > 0 ? Math.round((mtdRevenue / daysElapsed) * dim) : mtdRevenue;
    const monthTarget = Number((store as Store | null)?.monthly_target_revenue || 0);

    const { result, model, raw } = await generateFeedback({
      report: rep,
      memos: (memos as ContractMemo[]) || [],
      store: (store as Store) ?? null,
      memberName: (member?.name as string) || "担当者",
      context: {
        monthLabel: formatMonthLabel(monthKey),
        daysElapsed,
        daysInMonth: dim,
        mtdRevenue,
        monthTarget,
        projectedRevenue,
        mtdNew,
        mtdContract,
      },
    });

    // 保存は service role（ai_feedback への insert はサーバー専用）
    const admin = createAdminClient();
    const { data: saved, error: saveErr } = await admin
      .from("ai_feedback")
      .upsert(
        {
          report_id: reportId,
          model,
          summary: result.summary,
          issues: result.issues,
          advice: result.advice,
          encouragement: result.encouragement,
          raw: raw as object,
        },
        { onConflict: "report_id" }
      )
      .select()
      .single();

    if (saveErr) {
      // 保存に失敗してもフィードバック本文は返す
      return NextResponse.json({ feedback: { ...result, report_id: reportId, model }, cached: false, saveError: saveErr.message });
    }

    return NextResponse.json({ feedback: saved, cached: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
