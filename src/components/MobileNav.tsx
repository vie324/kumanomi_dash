"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  PenLine,
  ClipboardList,
  Wallet,
  Clock,
  PersonStanding,
  HeartPulse,
  Sparkles,
  Users,
  BookOpen,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/reports/new": PenLine,
  "/reports": ClipboardList,
  "/cashbook": Wallet,
  "/attendance": Clock,
  "/posture": PersonStanding,
  "/report-card": HeartPulse,
  "/concierge": Sparkles,
  "/members": Users,
  "/menu": BookOpen,
  "/admin/members": ShieldCheck,
};

// モバイル下部ナビ（アプリのような操作感）。md以上では非表示（上部タブを使用）。
export default function MobileNav({
  items,
  active,
}: {
  items: { href: string; label: string }[];
  active: string;
}) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/60 bg-white/85 backdrop-blur-xl shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.25)]">
      <div className="flex gap-0.5 overflow-x-auto no-scrollbar px-2 py-1.5">
        {items.map((n) => {
          const Icon = ICONS[n.href] ?? LayoutDashboard;
          const isActive = active === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`shrink-0 flex flex-col items-center justify-center gap-0.5 min-w-[4.2rem] py-1.5 rounded-xl transition-colors ${
                isActive ? "text-sise-600 bg-sise-50" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
              <span className="text-[10px] font-semibold whitespace-nowrap">{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
