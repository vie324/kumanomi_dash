import { getCurrentMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import MembersView from "@/components/MembersView";
import type { Customer, CustomerTicket, Member, Store, TicketPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const member = await getCurrentMember();
  if (!member) return <NoAccess />;

  const supabase = createClient();
  const [{ data: storeRow }, { data: customers }, { data: plans }, { data: tickets }] =
    await Promise.all([
      supabase.from("stores").select("*").eq("id", member.store_id).maybeSingle(),
      supabase
        .from("customers")
        .select("*")
        .eq("store_id", member.store_id)
        .order("name", { ascending: true }),
      supabase
        .from("ticket_plans")
        .select("*")
        .eq("store_id", member.store_id)
        .order("sessions", { ascending: true }),
      supabase
        .from("customer_tickets")
        .select("*")
        .eq("store_id", member.store_id)
        .order("created_at", { ascending: false }),
    ]);

  return (
    <>
      <AppHeader member={member} store={(storeRow as Store) ?? null} active="/members" />
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
