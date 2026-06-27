-- ============================================================
-- 権限昇格ガード  Phase 2.6
-- ============================================================
-- 既定マトリクスでは dept_manager も staff_admin=manage を持つため、
-- 部門管理者が任意メンバー（自分含む）を owner に昇格でき、
-- role_permissions（権限マトリクス）も書き換えられた。
--
-- 対策（多層防御）:
--   1) members への INSERT/UPDATE で「自分の役割・スコープを超える付与」を
--      DBトリガーで拒否（anon-key 直叩きの昇格を遮断）。
--      ※ service role（サーバーアクション）は auth.uid() が NULL のため
--        トリガーは素通り＝正規の管理操作はアプリ層の上限チェックで担保。
--   2) role_permissions（capability マトリクス）の書き込みを owner 限定に。
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行（0007 実行済み前提）
-- ============================================================

-- 役割ランク（強い順）
create or replace function public.role_rank(p_role text) returns int
  language sql immutable as $$
  select case p_role
    when 'owner' then 4
    when 'dept_manager' then 3
    when 'manager' then 2
    when 'store_manager' then 1
    else 0 end
$$;

-- スコープランク（広い順）
create or replace function public.scope_rank(p_scope text) returns int
  language sql immutable as $$
  select case p_scope
    when 'all' then 4
    when 'department' then 3
    when 'assigned' then 2
    when 'store' then 1
    else 0 end
$$;

-- 役割の既定スコープ（permissions.ts の defaultScope と一致）
create or replace function public.default_scope_for(p_role text) returns text
  language sql immutable as $$
  select case p_role
    when 'owner' then 'all'
    when 'dept_manager' then 'department'
    when 'manager' then 'assigned'
    when 'store_manager' then 'store'
    else 'store' end
$$;

-- members 変更時の昇格ガード
create or replace function public.enforce_member_role_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  editor_role  text;
  editor_id    uuid;
  editor_scope text;
begin
  -- service role / 移行スクリプト（セッション無し）は素通り
  if auth.uid() is null then
    return new;
  end if;

  select id, role, coalesce(scope, public.default_scope_for(role))
    into editor_id, editor_role, editor_scope
  from public.members where auth_user_id = auth.uid() limit 1;

  -- 役割が変わらない更新はスキップ（役割/スコープ以外の編集を妨げない）
  if tg_op = 'UPDATE'
     and new.role is not distinct from old.role
     and new.scope is not distinct from old.scope then
    return new;
  end if;

  -- 編集者不明はガード（昇格を許さない）
  if editor_role is null then
    raise exception 'role change denied: editor not found';
  end if;

  -- 自分より上位の役割は付与不可
  if public.role_rank(new.role) > public.role_rank(editor_role) then
    raise exception 'role escalation denied: cannot assign a role above your own (%).', editor_role;
  end if;

  -- 自分自身の昇格は不可
  if tg_op = 'UPDATE' and new.id = editor_id
     and public.role_rank(new.role) > public.role_rank(old.role) then
    raise exception 'self role escalation denied';
  end if;

  -- 自分より広いデータ範囲は付与不可
  if new.scope is not null
     and public.scope_rank(new.scope) > public.scope_rank(editor_scope) then
    raise exception 'scope escalation denied: cannot grant a wider scope than your own (%).', editor_scope;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_member_role_guard on public.members;
create trigger trg_member_role_guard
  before insert or update on public.members
  for each row execute function public.enforce_member_role_guard();

-- role_permissions（権限マトリクス）の書き込みは owner 限定
drop policy if exists "role_permissions_write" on public.role_permissions;
create policy "role_permissions_write" on public.role_permissions
  for all to authenticated
  using (public.cm_role() = 'owner')
  with check (public.cm_role() = 'owner');
