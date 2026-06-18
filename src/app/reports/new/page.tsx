import { createClient } from "@/lib/supabase/server";
import { loadPageAccess } from "@/lib/admin-guard";
import { canEdit } from "@/lib/permissions";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import PermissionDenied from "@/components/PermissionDenied";
import ReportForm from "@/components/ReportForm";
import type { MediaChannel, MenuPlan, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewReportPage() {
  const access = await loadPageAccess("daily_reports");
  if (!access.member) return <NoAccess />;
  const { member, matrix } = access;

  const supabase = createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();

  // 日報入力は編集権限が必要
  if (!canEdit(matrix, member, "daily_reports")) {
    return <PermissionDenied member={member} store={(store as Store) ?? null} message="日報を入力する権限がありません。" />;
  }

  // 媒体マスタ（本人の業態 + 自店舗/全店舗共通のみ）
  const { data: channelRows } = await supabase
    .from("media_channels")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const channels = ((channelRows as MediaChannel[]) || []).filter(
    (c) =>
      (c.genre === null || c.genre === member.genre) &&
      (c.store_id === null || c.store_id === member.store_id)
  );

  // 契約内容リンク用の料金表メニュー（本人の業態 + 自店舗/共通）
  const { data: menuRows } = await supabase
    .from("menu_plans")
    .select("*")
    .eq("genre", member.genre)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const menuPlans = ((menuRows as MenuPlan[]) || []).filter(
    (p) => p.store_id === null || p.store_id === member.store_id
  );

  return (
    <>
      <AppHeader member={member} store={(store as Store) ?? null} active="/reports/new" />
      <main className="max-w-5xl mx-auto px-4 py-5 pb-24">
        <h1 className="text-xl font-extrabold text-slate-900 mb-1">日報入力</h1>
        <p className="text-xs text-slate-500 mb-5">
          売上・成績を記録し、契約の取れた/取れなかった理由を残すと、AIが課題と改善策をフィードバックします。
        </p>
        <ReportForm member={member} store={(store as Store) ?? null} channels={channels} menuPlans={menuPlans} />
      </main>
    </>
  );
}
