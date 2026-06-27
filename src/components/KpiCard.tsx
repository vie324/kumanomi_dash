"use client";

import type { ReactNode } from "react";
import AnimatedNumber from "./AnimatedNumber";

type Tone = "brand" | "blue" | "emerald" | "purple" | "orange" | "slate" | "rose" | "amber";

const TONE: Record<Tone, { text: string; badge: string }> = {
  brand: { text: "text-sise-600", badge: "bg-sise-100 text-sise-600" },
  blue: { text: "text-blue-600", badge: "bg-blue-100 text-blue-600" },
  emerald: { text: "text-emerald-600", badge: "bg-emerald-100 text-emerald-600" },
  purple: { text: "text-purple-600", badge: "bg-purple-100 text-purple-600" },
  orange: { text: "text-orange-600", badge: "bg-orange-100 text-orange-600" },
  slate: { text: "text-slate-700", badge: "bg-slate-100 text-slate-600" },
  rose: { text: "text-rose-600", badge: "bg-rose-100 text-rose-600" },
  amber: { text: "text-amber-600", badge: "bg-amber-100 text-amber-600" },
};

// 動的なKPIカード。数値はカウントアップ、アイコンバッジ付き、出現アニメ対応。
export default function KpiCard({
  label,
  value,
  format,
  suffix,
  sub,
  icon,
  tone = "brand",
  index = 0,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  suffix?: string;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  index?: number;
}) {
  const t = TONE[tone];
  const delay = Math.min(index, 12) * 55;
  return (
    <div
      className="kpi-card animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-slate-500 font-medium">{label}</p>
        {icon && (
          <span className={`grid place-items-center w-7 h-7 rounded-lg ${t.badge}`}>{icon}</span>
        )}
      </div>
      <p className={`mt-1 text-2xl font-extrabold tracking-tight ${t.text}`}>
        <AnimatedNumber value={value} format={format} />
        {suffix && <span className="text-lg font-bold ml-0.5">{suffix}</span>}
      </p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}
