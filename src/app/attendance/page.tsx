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

  // 未退勤の最新シフト（月またぎ・前日からの打刻漏れも拾う）
  const { data: openRow } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("member_id", member.id)
    .not("clock_in_at", "is", null)
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const openShift = (openRow as AttendanceRecord) ?? null;

  // 表示用：未退勤シフトが当月レコードに無ければ先頭に補う
  if (openShift && !records.some((r) => r.id === openShift.id)) {
    records.unshift(openShift);
  }

  // 打刻対象：未退勤シフト優先、無ければ今日のレコード
  const todayRecord =
    openShift ||
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
