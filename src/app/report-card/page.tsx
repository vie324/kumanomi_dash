import { createClient } from "@/lib/supabase/server";
import { loadPageAccess } from "@/lib/admin-guard";
import { canEdit } from "@/lib/permissions";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import PermissionDenied from "@/components/PermissionDenied";
import TreatmentReportView from "@/components/TreatmentReportView";
import type { Member, Store, TreatmentReportRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReportCardPage() {
  const access = await loadPageAccess("report_card");
  if (!access.member) return <NoAccess />;
  const { member, matrix, storeIds } = access;

  const supabase = createClient();
  const { data: storeRow } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();
  const store = (storeRow as Store) ?? null;

  if (!access.allowed) {
    return <PermissionDenied member={member} store={store} message="施術レポートの閲覧権限がありません。" />;
  }

  // 直近の保存済みレポート（スコープ内店舗）
  let q = supabase
    .from("treatment_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  if (storeIds) q = q.in("store_id", storeIds);
  const { data: reportRows } = await q;
  const initialReports = (reportRows as TreatmentReportRow[]) || [];

  return (
    <>
      <AppHeader member={member} store={store} active="/report-card" />
      <main className="max-w-6xl mx-auto px-4 py-5">
        <TreatmentReportView
          defaultStaff={member.name}
          genre={member.genre}
          member={member as Member}
          canEdit={canEdit(matrix, member, "report_card")}
          initialReports={initialReports}
        />
      </main>
    </>
  );
}
