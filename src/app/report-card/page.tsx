import { getCurrentMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import TreatmentReportView from "@/components/TreatmentReportView";
import type { Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReportCardPage() {
  const member = await getCurrentMember();
  if (!member) return <NoAccess />;

  const supabase = createClient();
  const { data: storeRow } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();

  return (
    <>
      <AppHeader member={member} store={(storeRow as Store) ?? null} active="/report-card" />
      <main className="max-w-6xl mx-auto px-4 py-5">
        <TreatmentReportView defaultStaff={member.name} />
      </main>
    </>
  );
}
