"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendPoint = { date: string; revenue: number; new: number; contract: number };

export default function DashboardCharts({
  trend,
  accent = "#f97316",
}: {
  trend: TrendPoint[];
  accent?: string;
}) {
  if (!trend || trend.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-sm text-slate-400">
        日報が入力されると、売上と新規/契約の推移が表示されます。
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="glass-card card-hover p-4">
        <p className="text-xs font-bold text-slate-700 mb-3">売上推移</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={trend} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v: number) => [`¥${v.toLocaleString()}`, "売上"]} />
            <Area type="monotone" dataKey="revenue" stroke={accent} strokeWidth={2.5} fill="url(#rev)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="glass-card card-hover p-4">
        <p className="text-xs font-bold text-slate-700 mb-3">新規 / 契約 推移</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={28} allowDecimals={false} />
            <Tooltip formatter={(v: number, n) => [`${v}人`, n === "new" ? "新規" : "契約"]} />
            <Legend formatter={(v) => (v === "new" ? "新規" : "契約")} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="new" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="contract" fill="#22c55e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
