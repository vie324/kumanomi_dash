import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin-guard";
import AppHeader from "@/components/AppHeader";
import MediaChannelEditor from "@/components/admin/MediaChannelEditor";
import type { MediaChannel, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MediaAdminPage() {
  const guard = await requirePermission("staff_admin", "manage");
  if (!guard) {
    return (
      <main className="min-h-screen grid place-items-center px-4 bg-slate-50">
        <div className="glass-card p-7 max-w-sm text-center">
          <h1 className="text-lg font-extrabold text-slate-900 mb-2">権限がありません</h1>
          <p className="text-sm text-slate-500 mb-5">この画面（媒体設定）にアクセスする権限がありません。</p>
          <Link href="/" className="btn-ghost w-full">ダッシュボードへ</Link>
        </div>
      </main>
    );
  }
  const { member } = guard;

  const supabase = createClient();
  const [{ data: storeRow }, { data: channels }] = await Promise.all([
    supabase.from("stores").select("*").eq("id", member.store_id).maybeSingle(),
    supabase
      .from("media_channels")
      .select("*")
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <>
      <AppHeader member={member} store={(storeRow as Store) ?? null} active="/admin/members" showAdmin />
      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/admin/members" className="text-xs text-slate-500 hover:text-slate-800">← スタッフ割当</Link>
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">媒体（集客チャネル）設定</h1>
          <p className="text-xs text-slate-500 mt-1">
            日報の契約メモで選べる媒体（ホットペッパー・Meta広告・紹介など）を管理します。
          </p>
        </div>
        <MediaChannelEditor
          storeId={member.store_id}
          initial={(channels as MediaChannel[]) || []}
        />
      </main>
    </>
  );
}
