import Link from "next/link";
import { GENRE_BRAND, type Member, type Store } from "@/lib/types";
import { getPermissionMatrix } from "@/lib/auth";
import { can, canEdit, type Resource } from "@/lib/permissions";
import BrandLogo from "./BrandLogo";
import ThemeApplier from "./ThemeApplier";
import MobileNav from "./MobileNav";

// nav 項目ごとに、表示に必要な閲覧リソースを紐付け。
// genreOnly を指定すると、その業態のメンバーにだけ表示する。
// genreHide を指定すると、その業態では非表示にする。
const NAV: {
  href: string;
  label: string;
  resource: Resource;
  needEdit?: boolean;
  genreOnly?: "seitai" | "esthe";
  genreHide?: "seitai" | "esthe";
}[] = [
  { href: "/", label: "ダッシュボード", resource: "dashboard" },
  { href: "/reports/new", label: "日報入力", resource: "daily_reports", needEdit: true },
  { href: "/reports", label: "日報一覧", resource: "daily_reports" },
  { href: "/cashbook", label: "出納帳", resource: "cashbook" },
  { href: "/attendance", label: "勤怠", resource: "attendance" },
  { href: "/posture", label: "姿勢分析", resource: "posture", genreHide: "esthe" },
  { href: "/report-card", label: "施術レポート", resource: "report_card" },
  { href: "/concierge", label: "診断・提案", resource: "dashboard", genreOnly: "esthe" },
  { href: "/members", label: "会員・回数券", resource: "members" },
  { href: "/menu", label: "料金表", resource: "dashboard" },
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
  const matrix = await getPermissionMatrix();
  const admin = showAdmin ?? can(matrix, member, "staff_admin", "manage");

  // 権限のあるタブだけ表示（編集が必要な項目は edit 権限で判定）
  const visibleNav = NAV.filter((n) => {
    if (n.genreOnly && n.genreOnly !== member.genre) return false;
    if (n.genreHide && n.genreHide === member.genre) return false;
    return n.needEdit ? canEdit(matrix, member, n.resource) : can(matrix, member, n.resource, "view");
  });
  const nav = admin ? [...visibleNav, { href: "/admin/members", label: "権限管理" }] : visibleNav;
  // genre が NULL/想定外でも落ちないよう既定（整体）にフォールバック
  const brand = GENRE_BRAND[member.genre] ?? GENRE_BRAND.seitai;
  return (
    <header className="sticky top-0 z-30 bg-white/75 backdrop-blur-xl border-b border-white/60 shadow-[0_2px_16px_-12px_rgba(15,23,42,0.3)]">
      <ThemeApplier genre={member.genre} />
      {/* 業態テーマのアクセントライン */}
      <div className="h-0.5 bg-gradient-to-r from-sise-400 via-sise-500 to-sise-600" />
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3 min-w-0">
            {/* 左上ロゴ（屋号名入り）。ロゴに店名が含まれるためブランド名テキストは表示しない。 */}
            <BrandLogo src={brand.logo} alt={brand.name} />
            {/* ロゴ未配置時のフォールバック表示用にブランド名を sr-only で保持 */}
            <span className="sr-only">{brand.name}</span>
            <div className="min-w-0">
              {store?.name && (
                <p className="text-xs font-bold text-slate-700 truncate leading-tight">{store.name}</p>
              )}
              <p className="text-[11px] text-slate-400 truncate leading-tight">{member.name} さん</p>
            </div>
          </div>
          <form action="/auth/signout" method="post">
            <button className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              ログアウト
            </button>
          </form>
        </div>
        {/* デスクトップ：上部ピルタブ（モバイルは下部ナビへ） */}
        <nav className="hidden md:flex gap-1 pb-2 overflow-x-auto no-scrollbar">
          {nav.map((n) => {
            const isActive = active === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap px-3.5 py-1.5 text-sm font-semibold rounded-full transition-all duration-200 ${
                  isActive
                    ? "bg-gradient-to-br from-sise-500 to-sise-600 text-white shadow-[0_6px_14px_-6px_var(--ring-shadow)]"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <MobileNav items={nav} active={active} />
    </header>
  );
}
