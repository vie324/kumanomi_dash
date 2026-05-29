import { createClient } from "@/lib/supabase/server";
import { loadPageAccess } from "@/lib/admin-guard";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import PermissionDenied from "@/components/PermissionDenied";
import MembersView from "@/components/MembersView";
import type { Customer, CustomerTicket, Member, Store, TicketPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const access = await loadPageAccess("members");
  if (!access.member) return <NoAccess />;
  const { member, storeIds } = access;

  const supabase = createClient();
  const { data: storeRow } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();
  const store = (storeRow as Store) ?? null;

  if (!access.allowed) {
    return <PermissionDenied member={member} store={store} message="会員・回数券の閲覧権限がありません。" />;
  }

  let customersQuery = supabase.from("customers").select("*").order("name", { ascending: true });
  let plansQuery = supabase.from("ticket_plans").select("*").order("sessions", { ascending: true });
  let ticketsQuery = supabase
    .from("customer_tickets")
    .select("*")
    .order("created_at", { ascending: false });
  if (storeIds) {
    customersQuery = customersQuery.in("store_id", storeIds);
    plansQuery = plansQuery.in("store_id", storeIds);
    ticketsQuery = ticketsQuery.in("store_id", storeIds);
  }

  const [{ data: customers }, { data: plans }, { data: tickets }] = await Promise.all([
    customersQuery,
    plansQuery,
    ticketsQuery,
  ]);

  return (
    <>
      <AppHeader member={member} store={store} active="/members" />
      <main className="max-w-5xl mx-auto px-4 py-5">
        <MembersView
          member={member as Member}
          initialCustomers={(customers as Customer[]) || []}
          initialPlans={(plans as TicketPlan[]) || []}
          initialTickets={(tickets as CustomerTicket[]) || []}
        />
      </main>
    </>
  );
}
