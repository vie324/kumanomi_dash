-- ============================================================
-- 日報の一意制約を店舗別に  Phase 2.7
-- ============================================================
-- 旧: unique(member_id, report_date) … 1メンバー1日1件。
-- これだとヘルプ勤務で「同じ日に自店＋ヘルプ先」の2本を記録できず、
-- upsert が既存日報を上書きしてしまう。
-- 新: unique(member_id, report_date, store_id) … 勤務店舗ごとに1件。
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- ============================================================

alter table public.daily_reports
  drop constraint if exists daily_reports_member_id_report_date_key;

alter table public.daily_reports
  drop constraint if exists daily_reports_member_date_store_key;

alter table public.daily_reports
  add constraint daily_reports_member_date_store_key
  unique (member_id, report_date, store_id);
