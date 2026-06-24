"use client";

import { useMemo, useState } from "react";
import type { MenuPlan } from "@/lib/types";

function yen(n: number | null): string {
  if (n == null) return "—";
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

// お悩み → おすすめカテゴリ（pbb_ を参考にしたタグ付け）
type Concern = { key: string; label: string; tags: string[] };
const CONCERNS: Concern[] = [
  { key: "diet", label: "ダイエット・痩身", tags: ["痩身", "ボディ", "EMS", "骨盤"] },
  { key: "legs", label: "脚やせ・むくみ", tags: ["痩身", "リンパ", "むくみ", "ボディ"] },
  { key: "kogao", label: "小顔・フェイスライン", tags: ["小顔", "矯正", "フェイ"] },
  { key: "skin", label: "肌のハリ・美肌", tags: ["フェイ", "美肌", "スノーピール", "RED"] },
  { key: "posture", label: "姿勢・骨盤の歪み", tags: ["骨盤", "矯正", "姿勢"] },
  { key: "relax", label: "疲れ・リラックス", tags: ["アロマ", "ヘッド", "リラク", "ドライヘッド"] },
  { key: "hair", label: "ムダ毛・脱毛", tags: ["脱毛"] },
];

// 深刻度 → おすすめプラン強度（pbb_ の メンテ/集中改善/根本改革）
const SEVERITY_TIERS = [
  { min: 0, label: "メンテナンス", desc: "良い状態を保つ。月1〜2回ペース。", sessions: [4, 5, 6] },
  { min: 34, label: "集中改善", desc: "気になる部分を集中的に。月2〜4回×数ヶ月。", sessions: [8, 10, 12] },
  { min: 67, label: "根本改革", desc: "3ヶ月の集中ケアで“戻る力”に勝ち定着させる。", sessions: [16, 20, 24] },
];

// SPECIAL キャンペーン（pbb_ 参考）
const SPECIALS = [
  { name: "美容鍼", before: 9900, after: 2980 },
  { name: "360°美顔小顔矯正", before: 8500, after: 1980 },
];

export default function ConciergeView({ menuPlans }: { menuPlans: MenuPlan[] }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [severity, setSeverity] = useState(50);

  const activeConcerns = CONCERNS.filter((c) => selected[c.key]);
  const tier = useMemo(() => {
    let t = SEVERITY_TIERS[0];
    for (const s of SEVERITY_TIERS) if (severity >= s.min) t = s;
    return t;
  }, [severity]);

  // 選択したお悩みのタグに一致するメニューを抽出
  const recommended = useMemo(() => {
    if (activeConcerns.length === 0) return [];
    const tags = activeConcerns.flatMap((c) => c.tags);
    const matched = menuPlans.filter((p) => {
      const hay = `${p.group_name} ${p.variant ?? ""} ${p.label ?? ""}`;
      return tags.some((t) => hay.includes(t));
    });
    // group_name 単位で代表1件にまとめる
    const seen = new Set<string>();
    const groups: { group: string; section: string; example: MenuPlan }[] = [];
    for (const p of matched) {
      if (seen.has(p.group_name)) continue;
      seen.add(p.group_name);
      groups.push({ group: p.group_name, section: p.section, example: p });
    }
    return groups;
  }, [activeConcerns, menuPlans]);

  // ティアに合う回数のプラン候補（おすすめ回数券）
  const tierPlans = useMemo(() => {
    return menuPlans
      .filter((p) => p.sessions != null && tier.sessions.includes(p.sessions))
      .slice(0, 12);
  }, [menuPlans, tier]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">診断・提案</h1>
        <p className="text-xs text-slate-500 mt-1">
          お悩みから、おすすめメニューとプランをご提案します（接客時の参考にお使いください）。
        </p>
      </div>

      {/* なぜ3ヶ月・週1なのか（pbb_ の教育コンテンツ） */}
      <div className="rounded-2xl border border-sise-200 bg-gradient-to-br from-sise-50 to-white p-5">
        <p className="text-sm font-bold text-sise-800 mb-1">なぜ「3ヶ月・週1回」なのか？</p>
        <p className="text-xs text-slate-600 leading-relaxed">
          身体には元に戻ろうとする力（ホメオスタシス）があります。最初の3ヶ月は週1ペースで
          <strong>「戻ろうとする力に勝つ」</strong>こと、そして
          <strong>「新しい自分を“定着”させる」</strong>ことが大切です。定着後はメンテナンスで美しさをキープします。
        </p>
      </div>

      {/* お悩み診断 */}
      <section className="glass-card p-5">
        <p className="text-sm font-bold text-slate-800 mb-1">✨ お悩み診断</p>
        <p className="text-[11px] text-slate-500 mb-3">気になるお悩みを選択してください（複数可）</p>
        <div className="flex flex-wrap gap-2">
          {CONCERNS.map((c) => {
            const on = !!selected[c.key];
            return (
              <button
                key={c.key}
                onClick={() => setSelected((p) => ({ ...p, [c.key]: !p[c.key] }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  on ? "bg-sise-500 text-white border-sise-500" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-500">お悩みの深刻度</span>
            <span className="text-xs font-bold text-sise-600">{tier.label}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={severity}
            onChange={(e) => setSeverity(Number(e.target.value))}
            className="w-full accent-sise-500"
          />
          <p className="text-[11px] text-slate-500 mt-1">{tier.desc}</p>
        </div>
      </section>

      {/* おすすめメニュー */}
      {activeConcerns.length > 0 && (
        <section className="glass-card p-5">
          <p className="text-sm font-bold text-slate-800 mb-3">あなたにおすすめのメニュー</p>
          {recommended.length === 0 ? (
            <p className="text-xs text-slate-400">該当メニューが見つかりませんでした。料金表をご確認ください。</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {recommended.map((r) => (
                <div key={r.group} className="rounded-xl border border-slate-100 p-3">
                  <p className="text-sm font-bold text-slate-800">{r.group}</p>
                  <p className="text-[11px] text-slate-400">{r.section}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* おすすめプラン（ティアに合う回数） */}
      {tierPlans.length > 0 && (
        <section className="glass-card p-5">
          <p className="text-sm font-bold text-slate-800 mb-1">おすすめプラン（{tier.label}）</p>
          <p className="text-[11px] text-slate-500 mb-3">目安の回数のプラン例です。</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
                  <th className="py-1.5 pr-2 font-semibold">メニュー</th>
                  <th className="py-1.5 px-2 font-semibold text-center">回数</th>
                  <th className="py-1.5 px-2 font-semibold text-right">金額</th>
                  <th className="py-1.5 px-2 font-semibold text-right">1回あたり</th>
                </tr>
              </thead>
              <tbody>
                {tierPlans.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="py-1.5 pr-2 text-slate-700">
                      {[p.group_name, p.variant].filter(Boolean).join(" ")}
                    </td>
                    <td className="py-1.5 px-2 text-center text-slate-500">{p.sessions}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-slate-800">{yen(p.price)}</td>
                    <td className="py-1.5 px-2 text-right text-slate-500">{yen(p.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SPECIAL */}
      <section className="rounded-2xl border-2 border-rose-200 bg-rose-50/40 p-5">
        <p className="text-sm font-extrabold text-rose-600 mb-3">SPECIAL（体験キャンペーン）</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {SPECIALS.map((s) => (
            <div key={s.name} className="rounded-xl bg-white border border-rose-100 p-3 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800">{s.name}</span>
              <span className="text-sm">
                <span className="text-slate-400 line-through mr-1">{yen(s.before)}</span>
                <span className="text-rose-600 font-extrabold">{yen(s.after)}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="text-center">
        <a href="/menu" className="btn-ghost !py-2 text-sm">料金表をすべて見る →</a>
      </div>
    </div>
  );
}
