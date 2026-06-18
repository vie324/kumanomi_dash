-- ============================================================
-- 契約メモにメニュー連携  Phase 2.3
-- ============================================================
-- 新規のお客様ごとの契約記録の「契約内容」を料金表(menu_plans)と紐づける。
-- menu_plan_id = 選択したメニュー、menu_label = 表示用スナップショット
-- （メニューが後で変更/削除されても日報の記録は残る）
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- ============================================================

alter table public.contract_memos
  add column if not exists menu_plan_id uuid references public.menu_plans(id) on delete set null,
  add column if not exists menu_label text;
