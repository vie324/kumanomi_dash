import { createClient } from "@/lib/supabase/server";
import { loadPageAccess } from "@/lib/admin-guard";
import { canEdit } from "@/lib/permissions";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import PermissionDenied from "@/components/PermissionDenied";
import CashbookView from "@/components/CashbookView";
import type { CashbookEntry, Member, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CashbookPage() {
  const access = await loadPageAccess("cashbook");
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
    return <PermissionDenied member={member} store={store} message="出納帳の閲覧権限がありません。" />;
  }

  // スコープ内の店舗一覧（店舗切替用）
  let storesQuery = supabase.from("stores").select("*").eq("active", true).order("name", { ascending: true });
  if (storeIds) storesQuery = storesQuery.in("id", storeIds);
  const { data: storeRows } = await storesQuery;
  const scopeStores = (storeRows as Store[]) || [];

  // 現金残高は全期間必要なので店舗の全エントリを取得（トライアル規模では十分）
  let entriesQuery = supabase
    .from("cashbook_entries")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (storeIds) entriesQuery = entriesQuery.in("store_id", storeIds);
  const { data: entryRows } = await entriesQuery;
  const entries = (entryRows as CashbookEntry[]) || [];

  return (
    <>
      <AppHeader member={member} store={store} active="/cashbook" />
      <main className="max-w-5xl mx-auto px-4 py-5">
        <CashbookView
          member={member as Member}
          store={store}
          stores={scopeStores}
          initialEntries={entries}
          canEdit={canEdit(matrix, member, "cashbook")}
        />
      </main>
    </>
  );
}
