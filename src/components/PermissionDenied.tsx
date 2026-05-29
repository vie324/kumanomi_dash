import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import type { Member, Store } from "@/lib/types";

// ログイン済みだが該当機能の閲覧権限が無い場合に表示
export default function PermissionDenied({
  member,
  store,
  message = "この機能にアクセスする権限がありません。",
}: {
  member: Member;
  store: Store | null;
  message?: string;
}) {
  return (
    <>
      <AppHeader member={member} store={store} active="" />
      <main className="max-w-5xl mx-auto px-4 py-16">
        <div className="glass-card p-7 max-w-sm mx-auto text-center">
          <h1 className="text-lg font-extrabold text-slate-900 mb-2">権限がありません</h1>
          <p className="text-sm text-slate-500 mb-5">{message}</p>
          <Link href="/" className="btn-ghost w-full">ダッシュボードへ</Link>
        </div>
      </main>
    </>
  );
}
