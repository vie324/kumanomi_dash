-- ============================================================
-- 日報項目リニューアル（Phase 1.1）
-- ============================================================
-- 新仕様:
--   売上 / 施術数(既存のみ) → 次回予約数 / 新規数 → 2回目予約数 /
--   新規のお客様ごとの契約記録(契約有無・回数券or定額・プラン・理由) /
--   今日の振り返り / 明日の行動
--
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- ※ 旧カラム(hpb_*, meta_* 等 / target_revenue / note /
--   daily_tasks_completed / tomorrow_prep_completed / channel / next_action)は
--   後方互換のため削除せず残します（アプリ側では未使用）。
-- ============================================================

-- 日報: 新項目を追加
alter table public.daily_reports
  add column if not exists next_reservations         integer not null default 0,  -- 既存施術のうち次回予約に繋がった数
  add column if not exists new_count                 integer not null default 0,  -- 新規数
  add column if not exists second_visit_reservations integer not null default 0,  -- 2回目予約につながった数
  add column if not exists reflection                text,                        -- 今日の振り返り
  add column if not exists tomorrow_action           text;                        -- 明日の行動

-- 契約メモ: 契約内容(種別・プラン)を追加
alter table public.contract_memos
  add column if not exists contract_type text,    -- 'ticket'(回数券) | 'subscription'(定額)
  add column if not exists contract_plan integer; -- 回数券:4/8/16/32  定額:月2/4/6/8

-- contract_type の値を制限（存在しなければ追加）
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contract_memos_contract_type_check'
  ) then
    alter table public.contract_memos
      add constraint contract_memos_contract_type_check
      check (contract_type is null or contract_type in ('ticket','subscription'));
  end if;
end $$;
