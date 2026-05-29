-- ============================================================
-- 権限管理(RBAC)  Phase D: RLS でDBレベルの根本ブロック
-- ============================================================
-- Phase A〜C のアプリ層制御に加え、Supabase の Row Level Security を
-- 役割・スコープ・担当店舗に基づくポリシーへ置き換えます。
--
-- 方針:
--   - SELECT は role_permissions の view 以上 かつ スコープ内の店舗
--   - 追加/更新/削除 は edit 以上 かつ スコープ内の店舗
--   - スタッフの日報(daily_reports/contract_memos)は「自分のもの」のみ
--   - マスタ(stores/members/role_permissions等)は閲覧は認証済み全員、
--     書き込みは staff_admin / org_admin の manage/edit のみ
--   - service role キー(サーバーアクション)は RLS をバイパスするため、
--     管理画面からの更新は引き続き動作します。
--
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- ============================================================

-- ------------------------------------------------------------
-- ヘルパー関数（SECURITY DEFINER で RLS をバイパスして解決）
-- ------------------------------------------------------------
create or replace function public.cm_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from public.members where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.cm_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from public.members where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.cm_scope() returns text
  language sql stable security definer set search_path = public as $$
  select coalesce(scope,
    case role
      when 'owner' then 'all'
      when 'dept_manager' then 'department'
      when 'manager' then 'assigned'
      when 'store_manager' then 'store'
      else 'store'
    end)
  from public.members where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.cm_store() returns text
  language sql stable security definer set search_path = public as $$
  select store_id from public.members where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.cm_dept() returns uuid
  language sql stable security definer set search_path = public as $$
  select department_id from public.members where auth_user_id = auth.uid() limit 1
$$;

-- level 文字列を数値ランクへ
create or replace function public.perm_rank(p_level text) returns int
  language sql immutable as $$
  select case p_level
    when 'manage' then 3 when 'edit' then 2 when 'view' then 1 else 0 end
$$;

-- 現在のユーザーが resource に min_level 以上の権限を持つか
create or replace function public.has_perm(p_resource text, p_min_level text) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.perm_rank(coalesce(
    (select level from public.role_permissions
       where role = public.cm_role() and resource = p_resource limit 1),
    'none')) >= public.perm_rank(p_min_level)
$$;

-- 現在のユーザーが指定店舗にアクセスできるか（スコープ判定）
create or replace function public.can_store(p_store text) returns boolean
  language sql stable security definer set search_path = public as $$
  select case public.cm_scope()
    when 'all' then true
    when 'department' then (
      p_store = public.cm_store()
      or exists (
        select 1 from public.stores s
        where s.id = p_store and s.department_id is not null
          and s.department_id = public.cm_dept()
      )
    )
    when 'assigned' then (
      p_store = public.cm_store()
      or exists (
        select 1 from public.member_store_access a
        where a.member_id = public.cm_id() and a.store_id = p_store
      )
    )
    else -- store / own
      p_store = public.cm_store()
  end
$$;

-- 日報系の可視判定（スタッフは自分のもののみ）
create or replace function public.can_daily(p_store text, p_member uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select case
    when public.cm_role() = 'staff' then p_member = public.cm_id()
    else public.can_store(p_store)
  end
$$;

-- ============================================================
-- ポリシー置き換え
-- ============================================================

-- ---------- daily_reports ----------
alter table public.daily_reports enable row level security;
drop policy if exists "daily_reports_all_auth" on public.daily_reports;
drop policy if exists "daily_reports_select" on public.daily_reports;
drop policy if exists "daily_reports_write" on public.daily_reports;
create policy "daily_reports_select" on public.daily_reports
  for select to authenticated
  using (public.has_perm('daily_reports','view') and public.can_daily(store_id, member_id));
create policy "daily_reports_write" on public.daily_reports
  for all to authenticated
  using (public.has_perm('daily_reports','edit') and public.can_daily(store_id, member_id))
  with check (public.has_perm('daily_reports','edit') and public.can_daily(store_id, member_id));

-- ---------- contract_memos ----------
alter table public.contract_memos enable row level security;
drop policy if exists "contract_memos_all_auth" on public.contract_memos;
drop policy if exists "contract_memos_select" on public.contract_memos;
drop policy if exists "contract_memos_write" on public.contract_memos;
create policy "contract_memos_select" on public.contract_memos
  for select to authenticated
  using (public.has_perm('daily_reports','view') and public.can_daily(store_id, member_id));
create policy "contract_memos_write" on public.contract_memos
  for all to authenticated
  using (public.has_perm('daily_reports','edit') and public.can_daily(store_id, member_id))
  with check (public.has_perm('daily_reports','edit') and public.can_daily(store_id, member_id));

-- ---------- ai_feedback（書き込みは service role のみ） ----------
alter table public.ai_feedback enable row level security;
drop policy if exists "ai_feedback_select_auth" on public.ai_feedback;
drop policy if exists "ai_feedback_select" on public.ai_feedback;
create policy "ai_feedback_select" on public.ai_feedback
  for select to authenticated
  using (
    public.has_perm('daily_reports','view')
    and exists (
      select 1 from public.daily_reports r
      where r.id = report_id and public.can_daily(r.store_id, r.member_id)
    )
  );

-- ---------- cashbook_entries ----------
alter table public.cashbook_entries enable row level security;
drop policy if exists "cashbook_all_auth" on public.cashbook_entries;
drop policy if exists "cashbook_select" on public.cashbook_entries;
drop policy if exists "cashbook_write" on public.cashbook_entries;
create policy "cashbook_select" on public.cashbook_entries
  for select to authenticated
  using (public.has_perm('cashbook','view') and public.can_store(store_id));
create policy "cashbook_write" on public.cashbook_entries
  for all to authenticated
  using (public.has_perm('cashbook','edit') and public.can_store(store_id))
  with check (public.has_perm('cashbook','edit') and public.can_store(store_id));

-- ---------- attendance_records ----------
alter table public.attendance_records enable row level security;
drop policy if exists "attendance_all_auth" on public.attendance_records;
drop policy if exists "attendance_select" on public.attendance_records;
drop policy if exists "attendance_write" on public.attendance_records;
create policy "attendance_select" on public.attendance_records
  for select to authenticated
  using (public.has_perm('attendance','view') and public.can_store(store_id));
create policy "attendance_write" on public.attendance_records
  for all to authenticated
  using (public.has_perm('attendance','edit') and public.can_store(store_id))
  with check (public.has_perm('attendance','edit') and public.can_store(store_id));

-- ---------- customers ----------
alter table public.customers enable row level security;
drop policy if exists "customers_all_auth" on public.customers;
drop policy if exists "customers_select" on public.customers;
drop policy if exists "customers_write" on public.customers;
create policy "customers_select" on public.customers
  for select to authenticated
  using (public.has_perm('members','view') and public.can_store(store_id));
create policy "customers_write" on public.customers
  for all to authenticated
  using (public.has_perm('members','edit') and public.can_store(store_id))
  with check (public.has_perm('members','edit') and public.can_store(store_id));

-- ---------- ticket_plans ----------
alter table public.ticket_plans enable row level security;
drop policy if exists "ticket_plans_all_auth" on public.ticket_plans;
drop policy if exists "ticket_plans_select" on public.ticket_plans;
drop policy if exists "ticket_plans_write" on public.ticket_plans;
create policy "ticket_plans_select" on public.ticket_plans
  for select to authenticated
  using (public.has_perm('members','view') and public.can_store(store_id));
create policy "ticket_plans_write" on public.ticket_plans
  for all to authenticated
  using (public.has_perm('members','edit') and public.can_store(store_id))
  with check (public.has_perm('members','edit') and public.can_store(store_id));

-- ---------- customer_tickets ----------
alter table public.customer_tickets enable row level security;
drop policy if exists "customer_tickets_all_auth" on public.customer_tickets;
drop policy if exists "customer_tickets_select" on public.customer_tickets;
drop policy if exists "customer_tickets_write" on public.customer_tickets;
create policy "customer_tickets_select" on public.customer_tickets
  for select to authenticated
  using (public.has_perm('members','view') and public.can_store(store_id));
create policy "customer_tickets_write" on public.customer_tickets
  for all to authenticated
  using (public.has_perm('members','edit') and public.can_store(store_id))
  with check (public.has_perm('members','edit') and public.can_store(store_id));

-- ---------- ticket_usages（store は customer_tickets 経由） ----------
alter table public.ticket_usages enable row level security;
drop policy if exists "ticket_usages_all_auth" on public.ticket_usages;
drop policy if exists "ticket_usages_select" on public.ticket_usages;
drop policy if exists "ticket_usages_write" on public.ticket_usages;
create policy "ticket_usages_select" on public.ticket_usages
  for select to authenticated
  using (
    public.has_perm('members','view')
    and exists (select 1 from public.customer_tickets ct where ct.id = ticket_id and public.can_store(ct.store_id))
  );
create policy "ticket_usages_write" on public.ticket_usages
  for all to authenticated
  using (
    public.has_perm('members','edit')
    and exists (select 1 from public.customer_tickets ct where ct.id = ticket_id and public.can_store(ct.store_id))
  )
  with check (
    public.has_perm('members','edit')
    and exists (select 1 from public.customer_tickets ct where ct.id = ticket_id and public.can_store(ct.store_id))
  );

-- ============================================================
-- マスタ系: 閲覧は認証済み全員（名称解決等で必要）、書き込みは管理権限のみ
-- （実際の管理操作は service role 経由なので RLS をバイパスしますが、
--   万一 anon/anon-key 経由での書き込みを防ぐ多重防御）
-- ============================================================

-- ---------- stores ----------
drop policy if exists "stores_select_auth" on public.stores;
drop policy if exists "stores_write" on public.stores;
create policy "stores_select_auth" on public.stores
  for select to authenticated using (true);
create policy "stores_write" on public.stores
  for all to authenticated
  using (public.has_perm('org_admin','edit'))
  with check (public.has_perm('org_admin','edit'));

-- ---------- departments ----------
drop policy if exists "departments_select_auth" on public.departments;
drop policy if exists "departments_write" on public.departments;
create policy "departments_select_auth" on public.departments
  for select to authenticated using (true);
create policy "departments_write" on public.departments
  for all to authenticated
  using (public.has_perm('org_admin','edit'))
  with check (public.has_perm('org_admin','edit'));

-- ---------- members ----------
drop policy if exists "members_select_auth" on public.members;
drop policy if exists "members_write" on public.members;
create policy "members_select_auth" on public.members
  for select to authenticated using (true);
create policy "members_write" on public.members
  for all to authenticated
  using (public.has_perm('staff_admin','manage'))
  with check (public.has_perm('staff_admin','manage'));

-- ---------- role_permissions ----------
drop policy if exists "role_permissions_select_auth" on public.role_permissions;
drop policy if exists "role_permissions_write" on public.role_permissions;
create policy "role_permissions_select_auth" on public.role_permissions
  for select to authenticated using (true);
create policy "role_permissions_write" on public.role_permissions
  for all to authenticated
  using (public.has_perm('staff_admin','manage'))
  with check (public.has_perm('staff_admin','manage'));

-- ---------- member_store_access ----------
drop policy if exists "member_store_access_select_auth" on public.member_store_access;
drop policy if exists "member_store_access_write" on public.member_store_access;
create policy "member_store_access_select_auth" on public.member_store_access
  for select to authenticated using (true);
create policy "member_store_access_write" on public.member_store_access
  for all to authenticated
  using (public.has_perm('staff_admin','manage'))
  with check (public.has_perm('staff_admin','manage'));
