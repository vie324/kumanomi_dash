import { createClient } from "@/lib/supabase/server";
import { loadPageAccess } from "@/lib/admin-guard";
import { canEdit } from "@/lib/permissions";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import PermissionDenied from "@/components/PermissionDenied";
import PostureView from "@/components/PostureView";
import type { Member, PostureRecord, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PosturePage() {
  const access = await loadPageAccess("posture");
  if (!access.member) return <NoAccess />;
  const { member, matrix, storeIds } = access;

  const supabase = createClient();
  const { data: storeRow } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();
  const store = (storeRow as Store) ?? null;

  // 姿勢分析は整体専用（エステでは不要）
  if (member.genre === "esthe") {
    return <PermissionDenied member={member} store={store} message="姿勢分析は整体業態専用です。" />;
  }
  if (!access.allowed) {
    return <PermissionDenied member={member} store={store} message="姿勢分析の閲覧権限がありません。" />;
  }

  // 直近の保存済み分析（スコープ内店舗）
  let q = supabase
    .from("posture_records")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  if (storeIds) q = q.in("store_id", storeIds);
  const { data: recordRows } = await q;
  const initialRecords = (recordRows as PostureRecord[]) || [];

  return (
    <>
      <AppHeader member={member} store={store} active="/posture" />
      <main className="max-w-2xl mx-auto px-4 py-5">
        <PostureView
          member={member as Member}
          canEdit={canEdit(matrix, member, "posture")}
          initialRecords={initialRecords}
        />
      </main>
    </>
  );
}
