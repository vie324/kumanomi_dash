import { createClient } from "@/lib/supabase/server";
import { loadPageAccess } from "@/lib/admin-guard";
import AppHeader from "@/components/AppHeader";
import NoAccess from "@/components/NoAccess";
import PermissionDenied from "@/components/PermissionDenied";
import AttendanceView, { type TeamRecord } from "@/components/AttendanceView";
import type { AttendanceRecord, Member, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

type RawTeamRow = AttendanceRecord & {
  member?: { name: string } | null;
  store?: { name: string } | null;
};

function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function AttendancePage() {
  const access = await loadPageAccess("attendance");
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
    return <PermissionDenied member={member} store={store} message="勤怠の閲覧権限がありません。" />;
  }

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

  // 管理者（店長以上）はチームの勤怠を閲覧できる
  const canSeeTeam = member.role !== "staff";
  let teamRecords: TeamRecord[] = [];
  if (canSeeTeam) {
    let q = supabase
      .from("attendance_records")
      .select("*, member:members(name), store:stores(name)")
      .gte("work_date", monthStart)
      .order("work_date", { ascending: false })
      .order("clock_in_at", { ascending: false });
    if (storeIds) q = q.in("store_id", storeIds);
    const { data } = await q;
    teamRecords = ((data as RawTeamRow[]) || []).map((r) => ({
      ...(r as AttendanceRecord),
      member_name: r.member?.name ?? "—",
      store_name: r.store?.name ?? "",
    }));
  }

  return (
    <>
      <AppHeader member={member} store={store} active="/attendance" />
      <main className="max-w-2xl mx-auto px-4 py-5">
        <AttendanceView
          member={member as Member}
          store={store}
          initialRecords={records}
          initialToday={todayRecord}
          canSeeTeam={canSeeTeam}
          teamRecords={teamRecords}
          today={today}
        />
      </main>
    </>
  );
}
