-- ============================================================
-- 上尾店を追加（エステ部門）  Phase 2.4
-- ============================================================
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- ============================================================

insert into public.stores (id, name, genre, monthly_target_revenue, daily_target_new, daily_target_contract, active)
values ('ageo', '上尾店', 'esthe', 0, 0, 0, true)
on conflict (id) do update set name = excluded.name, genre = excluded.genre, active = true;

-- エステ部門に紐づけ
update public.stores s
set department_id = d.id
from public.departments d
where d.name = 'エステ部門' and s.id = 'ageo';
