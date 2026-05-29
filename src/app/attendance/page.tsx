import { getCurrentMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import AttendanceView from "@/components/AttendanceView";
import type { AttendanceRecord, Member, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function AttendancePage() {
  const member = await getCurrentMember();
  if (!member) return <NoAccess />;

  const supabase = createClient();
  const { data: storeRow } = await supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();
  const store = (storeRow as Store) ?? null;

  const today = todayJST();
  const monthStart = today.slice(0, 7) + "-01";

  // 当月の自分の記録
  const { data: recordRows } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("member_id", member.id)
    .gte("work_date", monthStart)
    .order("work_date", { ascending: false })
    .order("clock_in_at", { ascending: false });
  const records = (recordRows as AttendanceRecord[]) || [];

  // 今日の未退勤レコード
  const todayRecord =
    records.find((r) => r.work_date === today && !r.clock_out_at) ||
    records.find((r) => r.work_date === today) ||
    null;

  return (
    <>
      <AppHeader member={member} store={store} active="/attendance" />
      <main className="max-w-2xl mx-auto px-4 py-5">
        <AttendanceView
          member={member as Member}
          store={store}
          initialRecords={records}
          initialToday={todayRecord}
        />
      </main>
    </>
  );
}
