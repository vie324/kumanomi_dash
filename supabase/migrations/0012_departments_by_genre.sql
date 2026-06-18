-- ============================================================
-- 部門を業態(整体/エステ)で分ける  Phase 2.2
-- ============================================================
-- 「整体部門」「エステ部門」を作成し、各店舗・各メンバーに紐づける。
-- 成増店=整体部門、それ以外(大宮/銀座/越谷/川越/熊谷)=エステ部門。
-- これにより部門管理者(dept_manager)が業態単位で全店舗を統括できる。
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
--   ※ 0006_rbac.sql / 0010_genre_stores_media.sql を先に実行済みのこと。
-- ============================================================

-- 部門を作成（名前で冪等に）
insert into public.departments (name)
select v.name from (values ('整体部門'), ('エステ部門')) as v(name)
where not exists (select 1 from public.departments d where d.name = v.name);

-- 店舗に部門を割り当て（業態に基づく）
update public.stores s
set department_id = d.id
from public.departments d
where d.name = '整体部門' and s.genre = 'seitai';

update public.stores s
set department_id = d.id
from public.departments d
where d.name = 'エステ部門' and s.genre = 'esthe';

-- メンバーにも部門を割り当て（業態に基づく。未設定のみ上書き）
update public.members m
set department_id = d.id
from public.departments d
where d.name = '整体部門' and m.genre = 'seitai';

update public.members m
set department_id = d.id
from public.departments d
where d.name = 'エステ部門' and m.genre = 'esthe';
