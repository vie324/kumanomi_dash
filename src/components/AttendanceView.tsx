"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayJST } from "@/lib/date";
import { distanceMeters, type AttendanceRecord, type Member, type Store } from "@/lib/types";

export type TeamRecord = AttendanceRecord & { member_name: string; store_name: string };

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function workDuration(rec: AttendanceRecord): string {
  if (!rec.clock_in_at || !rec.clock_out_at) return "";
  const ms = new Date(rec.clock_out_at).getTime() - new Date(rec.clock_in_at).getTime();
  if (isNaN(ms) || ms <= 0) return "";
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}時間${m}分`;
}

const RADIUS_OK = 300; // 300m以内なら範囲内

type GpsState = {
  status: "idle" | "checking" | "ok" | "error";
  lat: number | null;
  lng: number | null;
  distance: number | null;
  error: string | null;
};

function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("この端末では位置情報が利用できません"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message || "位置情報の取得に失敗しました")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

export default function AttendanceView({
  member,
  store,
  initialRecords,
  initialToday,
  canSeeTeam = false,
  teamRecords = [],
  today: todayProp,
}: {
  member: Member;
  store: Store | null;
  initialRecords: AttendanceRecord[];
  initialToday: AttendanceRecord | null;
  canSeeTeam?: boolean;
  teamRecords?: TeamRecord[];
  today?: string;
}) {
  const supabase = createClient();
  const [tab, setTab] = useState<"clock" | "history" | "team">("clock");
  const todayDate = todayProp ?? todayJST();
  const [records, setRecords] = useState<AttendanceRecord[]>(initialRecords);
  const [today, setToday] = useState<AttendanceRecord | null>(initialToday);
  const [gps, setGps] = useState<GpsState>({ status: "idle", lat: null, lng: null, distance: null, error: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClockedIn = !!(today && today.clock_in_at && !today.clock_out_at);
  // 「本日の勤務完了」は今日のレコードが退勤済みのときのみ（前日の打刻漏れを退勤しても
  // 今日の出勤を妨げない）
  const isDone = !!(today && today.clock_out_at && today.work_date === todayDate);

  async function checkGps() {
    setGps({ status: "checking", lat: null, lng: null, distance: null, error: null });
    try {
      const pos = await getCurrentPosition();
      let distance: number | null = null;
      if (store && store.lat != null && store.lng != null) {
        distance = distanceMeters(pos.lat, pos.lng, store.lat, store.lng);
      }
      setGps({ status: "ok", lat: pos.lat, lng: pos.lng, distance, error: null });
    } catch (e) {
      setGps({
        status: "error",
        lat: null,
        lng: null,
        distance: null,
        error: e instanceof Error ? e.message : "GPS取得に失敗しました",
      });
    }
  }

  async function handleClockIn() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        store_id: member.store_id,
        member_id: member.id,
        work_date: todayJST(),
        clock_in_at: new Date().toISOString(),
        clock_in_lat: gps.lat,
        clock_in_lng: gps.lng,
        method: gps.status === "ok" ? "gps" : "manual",
      };
      const { data, error } = await supabase
        .from("attendance_records")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      const rec = data as AttendanceRecord;
      setToday(rec);
      setRecords((prev) => [rec, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "出勤記録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleClockOut() {
    if (!today) return;
    setSaving(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("attendance_records")
        .update({
          clock_out_at: new Date().toISOString(),
          clock_out_lat: gps.lat,
          clock_out_lng: gps.lng,
        })
        .eq("id", today.id)
        .select()
        .single();
      if (error) throw error;
      const rec = data as AttendanceRecord;
      setToday(rec);
      setRecords((prev) => prev.map((r) => (r.id === rec.id ? rec : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "退勤記録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const gpsBadge = useMemo(() => {
    if (gps.status === "idle") return null;
    if (gps.status === "checking") return { color: "#64748b", label: "GPS 取得中…" };
    if (gps.status === "error") return { color: "#dc2626", label: gps.error || "取得失敗" };
    if (gps.distance == null) return { color: "#94a3b8", label: "店舗の座標が未登録（手動で打刻できます）" };
    const ok = gps.distance <= RADIUS_OK;
    return {
      color: ok ? "#16a34a" : "#f59e0b",
      label: `${store?.name || "店舗"}まで ${gps.distance}m ${ok ? "(範囲内)" : "(範囲外)"}`,
    };
  }, [gps, store]);

  // 月次集計（履歴タブ）
  const monthStats = useMemo(() => {
    const days = new Set(records.filter((r) => r.clock_in_at).map((r) => r.work_date)).size;
    let totalMin = 0;
    for (const r of records) {
      if (r.clock_in_at && r.clock_out_at) {
        const ms = new Date(r.clock_out_at).getTime() - new Date(r.clock_in_at).getTime();
        if (!isNaN(ms) && ms > 0) totalMin += ms / 60000;
      }
    }
    const h = Math.floor(totalMin / 60);
    const m = Math.round(totalMin % 60);
    return { days, totalLabel: `${h}時間${m}分` };
  }, [records]);

  // チーム集計（管理者向け）。メンバーごとに本日の状態と当月の勤務日数/時間を集計。
  const teamData = useMemo(() => {
    type Agg = {
      member_id: string;
      name: string;
      store_name: string;
      todayRec: TeamRecord | null;
      days: Set<string>;
      minutes: number;
    };
    const map = new Map<string, Agg>();
    for (const r of teamRecords) {
      let a = map.get(r.member_id);
      if (!a) {
        a = { member_id: r.member_id, name: r.member_name, store_name: r.store_name, todayRec: null, days: new Set(), minutes: 0 };
        map.set(r.member_id, a);
      }
      if (r.clock_in_at) a.days.add(r.work_date);
      if (r.clock_in_at && r.clock_out_at) {
        const ms = new Date(r.clock_out_at).getTime() - new Date(r.clock_in_at).getTime();
        if (!isNaN(ms) && ms > 0) a.minutes += ms / 60000;
      }
      if (r.work_date === todayDate && (!a.todayRec || !r.clock_out_at)) a.todayRec = r;
    }
    const statusOrder: Record<string, number> = { in: 0, done: 1, off: 2 };
    return Array.from(map.values())
      .map((a) => {
        const status = a.todayRec ? (a.todayRec.clock_out_at ? "done" : "in") : "off";
        return {
          member_id: a.member_id,
          name: a.name,
          store_name: a.store_name,
          daysCount: a.days.size,
          hoursLabel: `${Math.floor(a.minutes / 60)}時間${Math.round(a.minutes % 60)}分`,
          status,
          inAt: a.todayRec?.clock_in_at ?? null,
          outAt: a.todayRec?.clock_out_at ?? null,
        };
      })
      .sort((x, y) => statusOrder[x.status] - statusOrder[y.status] || x.name.localeCompare(y.name, "ja"));
  }, [teamRecords, todayDate]);

  const workingNow = teamData.filter((t) => t.status === "in").length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-extrabold text-slate-900">勤怠管理</h1>
        <span className="ml-auto text-xs font-bold text-slate-500">{member.name} さん</span>
      </div>

      {/* タブ */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
        {([
          { k: "clock", l: "打刻" },
          { k: "history", l: "履歴" },
          ...(canSeeTeam ? [{ k: "team", l: "チーム" }] : []),
        ] as { k: "clock" | "history" | "team"; l: string }[]).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.k ? "bg-white text-sise-700 shadow-sm" : "text-slate-500"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "clock" && (
        <div className="space-y-3">
          {/* 今日のステータス */}
          <div
            className={`rounded-2xl p-5 border ${
              isClockedIn
                ? "bg-gradient-to-br from-sise-50 to-sise-100 border-sise-200"
                : isDone
                ? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200"
                : "bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200"
            }`}
          >
            <p
              className={`text-[10px] font-bold tracking-widest ${
                isClockedIn ? "text-sise-700" : isDone ? "text-emerald-700" : "text-slate-500"
              }`}
            >
              {todayJST()} の打刻状況
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span
                className={`text-2xl font-extrabold ${
                  isClockedIn ? "text-sise-700" : isDone ? "text-emerald-700" : "text-slate-500"
                }`}
              >
                {isClockedIn ? "勤務中" : isDone ? "勤務完了" : "未出勤"}
              </span>
              {today && (
                <div className="text-xs text-slate-500 ml-auto text-right">
                  {today.clock_in_at && <div>出勤 {fmtTime(today.clock_in_at)}</div>}
                  {today.clock_out_at && <div>退勤 {fmtTime(today.clock_out_at)}</div>}
                </div>
              )}
            </div>
          </div>

          {/* GPS確認 */}
          <div className="glass-card p-4">
            <p className="text-sm font-bold text-slate-800 mb-1">GPS確認（任意）</p>
            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              店舗の登録座標と現在地を比較し、在勤と思われる距離かを確認します。取得は任意で、できない場合も手動で打刻できます。
            </p>
            <button className="btn-ghost !py-2" onClick={checkGps} disabled={gps.status === "checking"}>
              {gps.status === "checking" ? "取得中…" : "現在地を取得"}
            </button>
            {gpsBadge && (
              <div
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{
                  background: gpsBadge.color + "12",
                  color: gpsBadge.color,
                  border: "1px solid " + gpsBadge.color + "30",
                }}
              >
                {gpsBadge.label}
              </div>
            )}
          </div>

          {/* 打刻ボタン */}
          {!isClockedIn ? (
            <button
              className="btn-primary w-full !py-3.5 text-base"
              onClick={handleClockIn}
              disabled={saving || isDone}
            >
              {saving ? "記録中…" : isDone ? "本日の勤務は完了しています" : "出勤"}
            </button>
          ) : (
            <button className="btn-primary w-full !py-3.5 text-base" onClick={handleClockOut} disabled={saving}>
              {saving ? "記録中…" : "退勤"}
            </button>
          )}

          {error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4 text-center">
              <p className="text-[11px] text-slate-500 mb-1">今月の出勤</p>
              <p className="text-2xl font-extrabold text-sise-600">{monthStats.days}<span className="text-sm">日</span></p>
            </div>
            <div className="glass-card p-4 text-center">
              <p className="text-[11px] text-slate-500 mb-1">今月の勤務時間</p>
              <p className="text-2xl font-extrabold text-slate-800">{monthStats.totalLabel}</p>
            </div>
          </div>

          {records.length === 0 ? (
            <div className="glass-card p-8 text-center text-sm text-slate-400">
              今月の記録はまだありません。出勤打刻すると履歴に表示されます。
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {records.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white">
                  <div className="text-xs font-bold text-slate-500 tabular-nums w-16">{r.work_date.slice(5)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-700">
                      {workDuration(r) || (r.clock_out_at ? "" : "勤務中")}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {r.method === "gps" ? "GPS打刻" : "手動打刻"}
                    </div>
                  </div>
                  <div className="text-xs tabular-nums text-right">
                    <div className="text-sise-700 font-bold">出 {fmtTime(r.clock_in_at)}</div>
                    <div className="text-slate-500">退 {fmtTime(r.clock_out_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "team" && canSeeTeam && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4 text-center">
              <p className="text-[11px] text-slate-500 mb-1">現在 勤務中</p>
              <p className="text-2xl font-extrabold text-sise-600">
                {workingNow}<span className="text-sm">名</span>
              </p>
            </div>
            <div className="glass-card p-4 text-center">
              <p className="text-[11px] text-slate-500 mb-1">メンバー</p>
              <p className="text-2xl font-extrabold text-slate-800">
                {teamData.length}<span className="text-sm">名</span>
              </p>
            </div>
          </div>

          {teamData.length === 0 ? (
            <div className="glass-card p-8 text-center text-sm text-slate-400">
              今月のチーム勤怠記録がありません。
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {teamData.map((t) => {
                const badge =
                  t.status === "in"
                    ? { c: "bg-emerald-100 text-emerald-700", l: "勤務中" }
                    : t.status === "done"
                    ? { c: "bg-slate-100 text-slate-500", l: "退勤済" }
                    : { c: "bg-amber-50 text-amber-600", l: "未出勤" };
                return (
                  <div key={t.member_id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-700">{t.name}</span>
                        <span className={`chip ${badge.c}`}>{badge.l}</span>
                        {t.store_name && (
                          <span className="text-[10px] text-slate-400">{t.store_name}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        今月 {t.daysCount}日 ・ {t.hoursLabel}
                      </div>
                    </div>
                    <div className="text-xs tabular-nums text-right">
                      <div className="text-sise-700 font-bold">出 {fmtTime(t.inAt)}</div>
                      <div className="text-slate-500">退 {fmtTime(t.outAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
