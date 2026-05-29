import Link from "next/link";
import type { Member, Store } from "@/lib/types";
import { getPermissionMatrix } from "@/lib/auth";
import { can } from "@/lib/permissions";

const NAV = [
  { href: "/", label: "ダッシュボード" },
  { href: "/reports/new", label: "日報入力" },
  { href: "/reports", label: "日報一覧" },
  { href: "/cashbook", label: "出納帳" },
  { href: "/attendance", label: "勤怠" },
  { href: "/posture", label: "姿勢分析" },
  { href: "/report-card", label: "施術レポート" },
  { href: "/members", label: "会員・回数券" },
];

export default async function AppHeader({
  member,
  store,
  active,
  showAdmin,
}: {
  member: Member;
  store: Store | null;
  active: string;
  // 未指定なら権限マトリクスから自動判定（staff_admin を管理できるか）
  showAdmin?: boolean;
}) {
  let admin = showAdmin;
  if (admin === undefined) {
    const matrix = await getPermissionMatrix();
    admin = can(matrix, member, "staff_admin", "manage");
  }
  const nav = admin ? [...NAV, { href: "/admin/members", label: "権限管理" }] : NAV;
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
          {nav.map((n) => {
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
