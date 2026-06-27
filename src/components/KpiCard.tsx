"use client";

import type { ReactNode } from "react";
import AnimatedNumber from "./AnimatedNumber";

type Tone = "brand" | "blue" | "emerald" | "purple" | "orange" | "slate" | "rose" | "amber";

// 数値フォーマットは「関数」ではなく「トークン文字列」で受け取る。
// Server Component から Client Component へ関数 prop は渡せない（RSCがシリアライズ不可で
// 「Functions cannot be passed directly to Client Components」エラーになり画面全体が落ちる）。
// そのためトークンを境界越しに渡し、クライアント側で実関数へ解決する。
export type KpiFormat = "int" | "yen" | "fixed0";
const FORMATTERS: Record<KpiFormat, (n: number) => string> = {
  int: (n) => Math.round(n).toLocaleString("ja-JP"),
  yen: (n) => "¥" + Math.round(n).toLocaleString("ja-JP"),
  fixed0: (n) => n.toFixed(0),
};

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
  delta,
}: {
  label: string;
  value: number;
  format?: KpiFormat;
  suffix?: string;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  index?: number;
  // 前月比など。null = 比較不可（前期間0）。
  delta?: number | null;
}) {
  const t = TONE[tone];
  const fmt = format ? FORMATTERS[format] : undefined;
  const delay = Math.min(index, 12) * 55;
  const hasDelta = delta !== undefined;
  const up = (delta ?? 0) >= 0;
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
        <AnimatedNumber value={value} format={fmt} />
        {suffix && <span className="text-lg font-bold ml-0.5">{suffix}</span>}
      </p>
      <div className="flex items-center gap-1.5 mt-0.5">
        {hasDelta && (
          delta === null ? (
            <span className="chip bg-slate-100 text-slate-400">前月比 —</span>
          ) : (
            <span className={`chip ${up ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>
              {up ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
            </span>
          )
        )}
        {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}
