import { getCurrentMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import ReportForm from "@/components/ReportForm";
import type { Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewReportPage() {
  const member = await getCurrentMember();
  if (!member) return <NoAccess />;

  const supabase = createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();

  return (
    <>
      <AppHeader member={member} store={(store as Store) ?? null} active="/reports/new" />
      <main className="max-w-5xl mx-auto px-4 py-5 pb-24">
        <h1 className="text-xl font-extrabold text-slate-900 mb-1">日報入力</h1>
        <p className="text-xs text-slate-500 mb-5">
          売上・成績を記録し、契約の取れた/取れなかった理由を残すと、AIが課題と改善策をフィードバックします。
        </p>
        <ReportForm member={member} store={(store as Store) ?? null} />
      </main>
    </>
  );
}
