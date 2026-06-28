import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessibleStoreIds, getCurrentMember, getPermissionMatrix } from "@/lib/auth";
import { can, roleRank } from "@/lib/permissions";
import { generateStaffCoaching, type CoachingStats } from "@/lib/ai-feedback";
import { formatMonthLabel, nextMonthStart } from "@/lib/date";
import type { ContractMemo, DailyReport, StaffGoal, Store } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/staff-coaching  { memberId, storeId, month, force? }
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const memberId: string | undefined = body?.memberId;
    const storeId: string | undefined = body?.storeId;
    const month: string | undefined = body?.month;
    const force: boolean = !!body?.force;
    if (!memberId || !storeId || !month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "memberId / storeId / month は必須です" }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // 権限: 店長以上 かつ スタッフ管理の閲覧権限 かつ 対象店舗が管轄内
    const actor = await getCurrentMember();
    const matrix = await getPermissionMatrix();
    if (
      !actor ||
      roleRank(actor.role) < roleRank("store_manager") ||
      !can(matrix, actor, "staff_admin", "view")
    ) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const accessible = await getAccessibleStoreIds(actor);
    if (accessible !== null && !accessible.includes(storeId)) {
      return NextResponse.json({ error: "管轄外の店舗です" }, { status: 403 });
    }

    const admin = createAdminClient();

    // キャッシュ: force でなければ既存を返す
    if (!force) {
      const { data: existing } = await admin
        .from("staff_coaching")
        .select("*")
        .eq("member_id", memberId)
        .eq("store_id", storeId)
        .eq("month", month)
        .maybeSingle();
      if (existing) return NextResponse.json({ coaching: existing, cached: true });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY が未設定です。" }, { status: 503 });
    }

    // 対象スタッフ・店舗
    const { data: memberRow } = await admin.from("members").select("name").eq("id", memberId).maybeSingle();
    const memberName = (memberRow?.name as string) || "スタッフ";
    const { data: storeRow } = await admin.from("stores").select("*").eq("id", storeId).maybeSingle();
    const store = (storeRow as Store) ?? null;

    // 当月の日報（対象店舗での計上分）
    const monthStart = month + "-01";
    const monthEnd = nextMonthStart(month);
    const { data: reportRows } = await admin
      .from("daily_reports")
      .select("*")
      .eq("member_id", memberId)
      .eq("store_id", storeId)
      .gte("report_date", monthStart)
      .lt("report_date", monthEnd);
    const reports = (reportRows as DailyReport[]) || [];

    if (reports.length === 0) {
      return NextResponse.json({ error: "対象月の日報がありません。" }, { status: 404 });
    }

    const reportIds = reports.map((r) => r.id);
    let memos: ContractMemo[] = [];
    if (reportIds.length > 0) {
      const { data } = await admin.from("contract_memos").select("*").in("report_id", reportIds);
      memos = (data as ContractMemo[]) || [];
    }
    const won = memos.filter((m) => m.outcome === "won");
    const lost = memos.filter((m) => m.outcome === "lost");

    const { data: goalRow } = await admin
      .from("staff_goals")
      .select("*")
      .eq("member_id", memberId)
      .eq("store_id", storeId)
      .eq("month", month)
      .maybeSingle();
    const goal = (goalRow as StaffGoal) ?? null;

    const sum = (f: (r: DailyReport) => number) => reports.reduce((s, r) => s + f(r), 0);
    const revenue = sum((r) => Number(r.revenue || 0));
    const newCount = sum((r) => r.new_count || 0);
    const existingTreatments = sum((r) => r.existing_treatments || 0);
    const nextReservations = sum((r) => r.next_reservations || 0);
    const secondVisit = sum((r) => r.second_visit_reservations || 0);
    const productSales = sum((r) => Number(r.product_sales || 0));
    const newProduct = sum((r) => Number(r.new_product_sales || 0));
    const renewalSales = sum((r) => Number(r.renewal_sales || 0));
    const newTrialAmount = sum((r) => Number(r.new_trial_amount || 0));
    const otherAmount = sum((r) => Number(r.other_amount || 0));
    const wonAmount = won.reduce((s, m) => s + Number(m.amount || 0), 0);
    const contract = won.length;

    const stats: CoachingStats = {
      monthLabel: formatMonthLabel(month),
      reportCount: reports.length,
      revenue,
      newCount,
      contract,
      contractRate: newCount > 0 ? Math.round((contract / newCount) * 100) : 0,
      existingTreatments,
      nextReservations,
      reservationRate: existingTreatments > 0 ? Math.round((nextReservations / existingTreatments) * 100) : 0,
      secondVisit,
      secondVisitRate: newCount > 0 ? Math.round((secondVisit / newCount) * 100) : 0,
      productSales: productSales + newProduct,
      renewalSales,
      newTrialAmount,
      newSalesTarget: goal ? Number(goal.new_sales_target || 0) : undefined,
      newSalesActual: wonAmount + newTrialAmount + newProduct,
      contractRateTarget: goal ? Number(goal.new_contract_rate_target || 0) : undefined,
      productTarget: goal ? Number(goal.product_target || 0) : undefined,
      productActual: productSales + newProduct,
      existingSalesTarget: goal ? Number(goal.existing_sales_target || 0) : undefined,
      existingSalesActual: renewalSales + productSales + otherAmount,
      wonReasons: won.map((m) => m.reason || "").filter(Boolean),
      lostReasons: lost.map((m) => m.reason || "").filter(Boolean),
      reflections: reports.map((r) => r.reflection || "").filter(Boolean),
    };

    const { result, model, raw } = await generateStaffCoaching({ memberName, store, stats });

    const { data: saved, error: saveErr } = await admin
      .from("staff_coaching")
      .upsert(
        {
          member_id: memberId,
          store_id: storeId,
          month,
          model,
          strengths: result.strengths,
          issues: result.issues,
          coaching: result.coaching,
          raw: raw as object,
        },
        { onConflict: "member_id,store_id,month" }
      )
      .select()
      .single();

    if (saveErr) {
      return NextResponse.json({
        coaching: { member_id: memberId, store_id: storeId, month, model, ...result },
        cached: false,
        saveError: saveErr.message,
      });
    }
    return NextResponse.json({ coaching: saved, cached: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
