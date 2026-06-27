-- ============================================================
-- スコープを役割の下限で底上げ（管理者が各店舗を見れないバグ修正）  Phase 2.6
-- ============================================================
-- 症状: 管理者(owner)等で members.scope が古い狭い値(例 'store')のままだと、
--       cm_scope() がその狭い scope を返し、RLS(can_store)で各店舗が見えない。
-- 対策: cm_scope() を「役割が保証する既定スコープより狭くならない」よう底上げ。
--       owner→all / dept_manager→department / manager→assigned / store_manager→store。
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行（0007 実行済み前提）。
-- ============================================================

-- スコープ順位（広いほど大）
create or replace function public.scope_rank(p_scope text) returns int
  language sql immutable as $$
  select case p_scope
    when 'all' then 4
    when 'department' then 3
    when 'assigned' then 2
    when 'store' then 1
    else 0 end
$$;

-- 役割の既定スコープ
create or replace function public.role_default_scope(p_role text) returns text
  language sql immutable as $$
  select case p_role
    when 'owner' then 'all'
    when 'dept_manager' then 'department'
    when 'manager' then 'assigned'
    when 'store_manager' then 'store'
    else 'store' end
$$;

-- cm_scope: 保存 scope と 役割既定 のうち「広い方」を採用（役割下限を保証）
create or replace function public.cm_scope() returns text
  language sql stable security definer set search_path = public as $$
  select case
    when m.scope is null then public.role_default_scope(m.role)
    when public.scope_rank(m.scope) >= public.scope_rank(public.role_default_scope(m.role))
      then m.scope
    else public.role_default_scope(m.role)
  end
  from public.members m
  where m.auth_user_id = auth.uid()
  limit 1
$$;

-- 既存データも揃えておく（任意・冪等）: 狭すぎる scope を役割既定へ引き上げ
update public.members
set scope = public.role_default_scope(role)
where scope is null
   or public.scope_rank(scope) < public.scope_rank(public.role_default_scope(role));
