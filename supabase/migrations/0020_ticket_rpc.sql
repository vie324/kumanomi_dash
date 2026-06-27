-- ============================================================
-- 回数券の消化/取消を原子化  Phase 2.8
-- ============================================================
-- クライアント側の read-modify-write（残数を読んで -1 して update）は、
-- 同時操作で更新が失われる（ロストアップデート）。
-- 行ロック付きの SECURITY DEFINER 関数で原子的に消化/取消する。
-- 権限は関数内で has_perm('members','edit') + can_store() を検証。
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行（0007 実行済み前提）
-- ============================================================

-- 1回消化（残数 > 0 のときのみ。利用履歴も記録）
create or replace function public.consume_ticket(p_ticket uuid)
returns public.customer_tickets
language plpgsql security definer set search_path = public as $$
declare
  t public.customer_tickets;
begin
  select * into t from public.customer_tickets where id = p_ticket for update;
  if not found then raise exception 'ticket not found'; end if;
  if not (public.has_perm('members','edit') and public.can_store(t.store_id)) then
    raise exception 'forbidden';
  end if;
  if t.remaining_sessions <= 0 then raise exception 'no remaining sessions'; end if;

  update public.customer_tickets
    set remaining_sessions = remaining_sessions - 1
    where id = p_ticket
    returning * into t;

  insert into public.ticket_usages (ticket_id, member_id)
    values (p_ticket, public.cm_id());

  return t;
end;
$$;

-- 消化の取り消し（残数 < 総数 のときのみ。直近の利用履歴を1件削除）
create or replace function public.restore_ticket(p_ticket uuid)
returns public.customer_tickets
language plpgsql security definer set search_path = public as $$
declare
  t public.customer_tickets;
  last_usage uuid;
begin
  select * into t from public.customer_tickets where id = p_ticket for update;
  if not found then raise exception 'ticket not found'; end if;
  if not (public.has_perm('members','edit') and public.can_store(t.store_id)) then
    raise exception 'forbidden';
  end if;
  if t.remaining_sessions >= t.total_sessions then raise exception 'already full'; end if;

  update public.customer_tickets
    set remaining_sessions = remaining_sessions + 1
    where id = p_ticket
    returning * into t;

  select id into last_usage from public.ticket_usages
    where ticket_id = p_ticket order by used_at desc limit 1;
  if last_usage is not null then
    delete from public.ticket_usages where id = last_usage;
  end if;

  return t;
end;
$$;

grant execute on function public.consume_ticket(uuid) to authenticated;
grant execute on function public.restore_ticket(uuid) to authenticated;
