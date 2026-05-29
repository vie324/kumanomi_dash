import Link from "next/link";
import type { Member, Store } from "@/lib/types";

const NAV = [
  { href: "/", label: "ダッシュボード" },
  { href: "/reports/new", label: "日報入力" },
  { href: "/reports", label: "日報一覧" },
];

export default function AppHeader({
  member,
  store,
  active,
}: {
  member: Member;
  store: Store | null;
  active: string;
}) {
  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-slate-100">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sise-500 text-white grid place-items-center font-extrabold">
              く
            </div>
            <div className="leading-tight">
              <p className="text-sm font-extrabold text-slate-900">{store?.name || "くまのみ整体院"}</p>
              <p className="text-[10px] text-slate-400">{member.name} さん</p>
            </div>
          </div>
          <form action="/auth/signout" method="post">
            <button className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1">ログアウト</button>
          </form>
        </div>
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {NAV.map((n) => {
            const isActive = active === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap px-3 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  isActive
                    ? "border-sise-500 text-sise-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
