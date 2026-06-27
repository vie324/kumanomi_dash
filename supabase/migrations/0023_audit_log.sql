-- ============================================================
-- 操作監査ログ  Phase 3.1
-- ============================================================
-- 管理操作（役割変更・スタッフ作成/無効化・権限マトリクス編集・マスタ編集）を
-- 記録する。書き込みは service role（サーバーアクション）経由のみ、
-- 閲覧は staff_admin を manage できる役割に限定する。
-- 実行方法: Supabase Dashboard → SQL Editor（0007 適用済みが前提）
-- ============================================================

create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_member_id uuid references public.members(id) on delete set null,
  actor_name      text,
  action          text not null,        -- 例: 'member.role_update'
  target_type     text,                 -- 'member' | 'role_permissions' | 'media_channel' | 'menu_plan'
  target_id       text,
  detail          jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;

-- 閲覧は staff_admin を manage できる役割のみ。
drop policy if exists "audit_log_select" on public.audit_log;
create policy "audit_log_select" on public.audit_log
  for select to authenticated
  using (public.has_perm('staff_admin', 'manage'));

-- INSERT/UPDATE/DELETE ポリシーは作らない（= authenticated は不可）。
-- 記録はサーバーアクション（service role）が RLS をバイパスして行う。
