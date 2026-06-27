-- ============================================================
-- RLS 本人性ハードニング  Phase 2.10
-- ============================================================
-- 既存ポリシーは「edit 権限＋店舗スコープ」のみを見ており、書き込み行の
-- member_id を書き手に固定していなかったため、edit 権限者が他人(member_id)の
-- 名義で 日報/契約メモ/勤怠 を作成・移動できた（なりすまし/IDOR）。
-- 本人の行は edit、他人の行は manage を要求するよう WITH CHECK を厳格化する。
-- 実行方法: Supabase Dashboard → SQL Editor（0007/0016 適用済みが前提）
-- ============================================================

-- ---------- daily_reports ----------
drop policy if exists "daily_reports_write" on public.daily_reports;
create policy "daily_reports_write" on public.daily_reports
  for all to authenticated
  using (
    (public.has_perm('daily_reports','edit') and member_id = public.cm_id() and public.can_write_store(store_id))
    or (public.has_perm('daily_reports','manage') and public.can_daily(store_id, member_id))
  )
  with check (
    (public.has_perm('daily_reports','edit') and member_id = public.cm_id() and public.can_write_store(store_id))
    or (public.has_perm('daily_reports','manage') and public.can_daily(store_id, member_id))
  );

-- ---------- contract_memos ----------
drop policy if exists "contract_memos_write" on public.contract_memos;
create policy "contract_memos_write" on public.contract_memos
  for all to authenticated
  using (
    (public.has_perm('daily_reports','edit') and member_id = public.cm_id() and public.can_write_store(store_id))
    or (public.has_perm('daily_reports','manage') and public.can_daily(store_id, member_id))
  )
  with check (
    (public.has_perm('daily_reports','edit') and member_id = public.cm_id() and public.can_write_store(store_id))
    or (public.has_perm('daily_reports','manage') and public.can_daily(store_id, member_id))
  );

-- ---------- attendance_records ----------
-- 本人の打刻は edit、他人の打刻記録は manage を要求。
drop policy if exists "attendance_write" on public.attendance_records;
create policy "attendance_write" on public.attendance_records
  for all to authenticated
  using (
    public.has_perm('attendance','edit') and public.can_store(store_id)
    and (member_id = public.cm_id() or public.has_perm('attendance','manage'))
  )
  with check (
    public.has_perm('attendance','edit') and public.can_store(store_id)
    and (member_id = public.cm_id() or public.has_perm('attendance','manage'))
  );
