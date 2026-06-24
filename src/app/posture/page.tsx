import { getCurrentMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import PermissionDenied from "@/components/PermissionDenied";
import PostureView from "@/components/PostureView";
import type { Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PosturePage() {
  const member = await getCurrentMember();
  if (!member) return <NoAccess />;

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

  return (
    <>
      <AppHeader member={member} store={store} active="/posture" />
      <main className="max-w-2xl mx-auto px-4 py-5">
        <PostureView />
      </main>
    </>
  );
}
