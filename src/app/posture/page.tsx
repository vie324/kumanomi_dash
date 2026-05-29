import { getCurrentMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
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

  return (
    <>
      <AppHeader member={member} store={(storeRow as Store) ?? null} active="/posture" />
      <main className="max-w-2xl mx-auto px-4 py-5">
        <PostureView />
      </main>
    </>
  );
}
