// JST 安全な日付ユーティリティ。
// すべて「YYYY-MM-DD」「YYYY-MM」の文字列を入出力の基準にし、
// ローカル Date への toISOString()（UTC変換）による日付ズレを避ける。

const JST = "Asia/Tokyo";

// 今日（JST）の YYYY-MM-DD
export function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// 今月（JST）の YYYY-MM
export function monthJST(): string {
  return todayJST().slice(0, 7);
}

// 今月初日（JST）の YYYY-MM-01
export function monthStartJST(): string {
  return monthJST() + "-01";
}

// "YYYY-MM" を delta ヶ月ずらす（純粋な算術。タイムゾーン非依存）
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

// "YYYY-MM-DD" に days 日加算（UTC基準で計算しズレを排除）
export function addDaysISO(ymd: string, days: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  if (isNaN(d.getTime())) return ymd;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 2つの YYYY-MM-DD の差（日数, b - a）
export function diffDays(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  if (isNaN(da) || isNaN(db)) return 0;
  return Math.round((db - da) / 86400000);
}

// "YYYY-MM" の翌月初日 "YYYY-MM-01"
export function nextMonthStart(ym: string): string {
  return shiftMonth(ym, 1) + "-01";
}

// "YYYY-MM" の日数（28〜31）
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return 30;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// 今日（JST）の「月内経過日数」（=日。1〜31）
export function dayOfMonthJST(): number {
  return Number(todayJST().slice(8, 10));
}

// "YYYY-MM" → "2026年6月"
export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${y}年${m}月`;
}

// "YYYY-MM-DD" → 表示用ラベル（リテラルの暦日をそのまま表示するため UTC で整形）
export function formatDateLabel(
  ymd: string,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", weekday: "short" }
): string {
  const d = new Date(ymd + "T00:00:00Z");
  if (isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "UTC", ...opts }).format(d);
}
