import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateFeedback } from "@/lib/ai-feedback";
import type { ContractMemo, DailyReport, Store } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    // 既存フィードバックがあり force でなければ返す
    if (!force) {
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

    const { result, model, raw } = await generateFeedback({
      report: report as DailyReport,
      memos: (memos as ContractMemo[]) || [],
      store: (store as Store) ?? null,
      memberName: (member?.name as string) || "担当者",
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
