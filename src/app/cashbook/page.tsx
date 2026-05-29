import { getCurrentMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import CashbookView from "@/components/CashbookView";
import type { CashbookEntry, Member, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CashbookPage() {
  const member = await getCurrentMember();
  if (!member) return <NoAccess />;

  const supabase = createClient();
  const { data: storeRow } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();
  const store = (storeRow as Store) ?? null;

  // 現金残高は全期間必要なので店舗の全エントリを取得（トライアル規模では十分）
  const { data: entryRows } = await supabase
    .from("cashbook_entries")
    .select("*")
    .eq("store_id", member.store_id)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  const entries = (entryRows as CashbookEntry[]) || [];

  return (
    <>
      <AppHeader member={member} store={store} active="/cashbook" />
      <main className="max-w-5xl mx-auto px-4 py-5">
        <CashbookView member={member as Member} store={store} initialEntries={entries} />
      </main>
    </>
  );
}
