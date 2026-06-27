-- ============================================================
-- 勤怠：休憩打刻と実働時間の正確化  Phase 3.2
-- ============================================================
-- これまで実働=退勤-出勤で、休憩時間が差し引かれていなかった。
-- 休憩開始/終了を打刻できるよう列を追加し、実働=退勤-出勤-休憩 とする。
--   break_started_at … 休憩中の開始時刻（休憩していなければ NULL）
--   break_minutes    … その日の休憩の累計（分）
-- 実行方法: Supabase Dashboard → SQL Editor
-- ============================================================

alter table public.attendance_records
  add column if not exists break_started_at timestamptz,
  add column if not exists break_minutes integer not null default 0;
