-- ============================================================
-- ヘルプ先計上の書き込みを「同業態の有効店舗」に制限  Phase 2.5.1
-- ============================================================
-- 0015 の write ポリシーは member_id = cm_id() のとき store_id を無制限に
-- 許可していた（任意店舗・別業態・無効店舗へ自分の日報を作成できた）。
-- 自分の業態の有効店舗に限定する can_write_store() を導入して塞ぐ。
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
--   ※ 0007 / 0015 実行済みが前提
-- ============================================================

-- 現在のユーザーが その store に「自分の日報」を計上してよいか
-- （自分の業態と一致し、かつ有効店舗であること）
create or replace function public.can_write_store(p_store text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stores s
    join public.members m on m.auth_user_id = auth.uid()
    where s.id = p_store
      and s.active = true
      and s.genre = m.genre
  )
$$;

-- daily_reports: own ブランチに can_write_store を追加
alter table public.daily_reports enable row level security;
drop policy if exists "daily_reports_write" on public.daily_reports;
create policy "daily_reports_write" on public.daily_reports
  for all to authenticated
  using (
    (member_id = public.cm_id() and public.can_write_store(store_id))
    or (public.has_perm('daily_reports','edit') and public.can_daily(store_id, member_id))
  )
  with check (
    (member_id = public.cm_id() and public.can_write_store(store_id))
    or (public.has_perm('daily_reports','edit') and public.can_daily(store_id, member_id))
  );

-- contract_memos: 同様に own ブランチへ can_write_store を追加
alter table public.contract_memos enable row level security;
drop policy if exists "contract_memos_write" on public.contract_memos;
create policy "contract_memos_write" on public.contract_memos
  for all to authenticated
  using (
    (member_id = public.cm_id() and public.can_write_store(store_id))
    or (public.has_perm('daily_reports','edit') and public.can_daily(store_id, member_id))
  )
  with check (
    (member_id = public.cm_id() and public.can_write_store(store_id))
    or (public.has_perm('daily_reports','edit') and public.can_daily(store_id, member_id))
  );
