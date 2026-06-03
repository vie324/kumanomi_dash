-- ============================================================
-- 媒体マスタへ EPARK を追加  Phase 1.6
-- ============================================================
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- （既に存在する場合は何もしない）
-- ============================================================

insert into public.media_channels (store_id, name, sort_order, active)
select 'narimasu', 'EPARK', 7, true
where not exists (
  select 1 from public.media_channels
  where store_id = 'narimasu' and name = 'EPARK'
);
