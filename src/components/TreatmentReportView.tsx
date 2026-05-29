"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { todayJST } from "@/lib/posture";

const SCORE_KEYS = [
  { key: "posture", label: "姿勢" },
  { key: "pelvis", label: "骨盤" },
  { key: "face", label: "顔・頭" },
  { key: "metabolism", label: "代謝・巡り" },
  { key: "flex", label: "柔軟性" },
] as const;

const MENU_OPTIONS = ["骨盤矯正", "姿勢矯正", "小顔矯正", "ほぐし", "鍼灸", "美容鍼"];

const COMMENT_TEMPLATES = [
  { key: "maintenance", label: "継続ケア", text: "本日もご来店ありがとうございました。\n前回より状態が安定してきています。引き続き定期的なケアで維持していきましょう。" },
  { key: "first", label: "初回", text: "本日はご来店ありがとうございました。\nまずは姿勢の癖を意識する所から始めてみてください。少しずつ身体が変わっていくのを一緒に見ていきましょう。" },
  { key: "shoulder", label: "肩・首", text: "肩・首まわりの緊張が強く出ていました。お伝えしたストレッチを 1 日 1 回でも継続して頂けると効果が出やすいです。" },
  { key: "pelvis", label: "骨盤", text: "骨盤の左右差が見られました。座り方の左右クセに気をつけて、骨盤体操を毎日続けてみてください。" },
  { key: "face", label: "小顔", text: "食いしばり由来の側頭部・咬筋の張りがありました。顎の力を抜いて、お渡しした耳まわしを 1 日数回試してみてください。" },
  { key: "cold", label: "冷え", text: "むくみ・冷えのサインが強く出ていました。湯船にゆっくり浸かる + ふくらはぎのストレッチで巡りを良くしていきましょう。" },
];

const STRETCH_OPTIONS = [
  { key: "chest", label: "胸ひらき", desc: "壁の横で腕を後ろに 15 秒キープ" },
  { key: "scapula", label: "肩甲骨はがし", desc: "腕を後ろに引いて 5 秒、力を抜く × 5回" },
  { key: "neck", label: "首伸ばし", desc: "頭を斜め前に倒して 15 秒、左右各 2 回" },
  { key: "pelvis", label: "骨盤体操", desc: "椅子に浅く座って前後にゆらす × 10 回" },
  { key: "hip", label: "股関節ほぐし", desc: "仰向けで膝を抱え、肩方向にひきつける × 各 10 秒" },
  { key: "glute", label: "お尻ストレッチ", desc: "椅子に座り片足を反対の膝にのせて前傾 × 各 20 秒" },
  { key: "calf", label: "ふくらはぎ", desc: "かかと上げ下げ × 10 回 (1 日 2 セット)" },
  { key: "face", label: "耳まわし", desc: "耳をつまんで前後に大きく 30 秒" },
  { key: "jaw", label: "咬筋ゆるめ", desc: "こめかみ〜エラ周りを指圧で軽くほぐす" },
];

function trScoreColor(s: number): string {
  if (s >= 4) return "#16a34a";
  if (s >= 3) return "#84cc16";
  if (s >= 2) return "#f97316";
  return "#dc2626";
}

export default function TreatmentReportView({ defaultStaff }: { defaultStaff: string }) {
  const [customerName, setCustomerName] = useState("");
  const [visitDate, setVisitDate] = useState(() => todayJST());
  const [staffName, setStaffName] = useState(defaultStaff);
  const [menuChecks, setMenuChecks] = useState<Record<string, boolean>>({});
  const [scores, setScores] = useState<Record<string, number>>(() =>
    SCORE_KEYS.reduce((o, s) => ({ ...o, [s.key]: 3 }), {})
  );
  const [comment, setComment] = useState("");
  const [stretchChecks, setStretchChecks] = useState<Record<string, boolean>>({});
  const [stretchNote, setStretchNote] = useState("");
  const [exporting, setExporting] = useState(false);

  const captureRef = useRef<HTMLDivElement | null>(null);

  const activeMenus = MENU_OPTIONS.filter((m) => menuChecks[m]);
  const activeStretches = STRETCH_OPTIONS.filter((s) => stretchChecks[s.key]);

  const avgScore = useMemo(() => {
    const vals = SCORE_KEYS.map((k) => scores[k.key]);
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }, [scores]);

  function applyTemplate(key: string) {
    const t = COMMENT_TEMPLATES.find((x) => x.key === key);
    if (t) setComment(t.text);
  }

  function reset() {
    if (!confirm("入力内容を全てクリアします。よろしいですか？")) return;
    setCustomerName("");
    setStaffName(defaultStaff);
    setComment("");
    setStretchNote("");
    setVisitDate(todayJST());
    setMenuChecks({});
    setScores(SCORE_KEYS.reduce((o, s) => ({ ...o, [s.key]: 3 }), {}));
    setStretchChecks({});
  }

  const exportPng = useCallback(async () => {
    if (!captureRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(captureRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      const safe = (customerName.trim() || "customer").replace(/\s+/g, "_");
      a.download = `report_${safe}_${visitDate}.png`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert("画像の書き出しに失敗しました");
    } finally {
      setExporting(false);
    }
  }, [customerName, visitDate]);

  return (
    <div className="grid lg:grid-cols-2 gap-5 animate-fade-in">
      {/* 編集パネル */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-slate-900">施術レポート</h1>
          <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={reset}>クリア</button>
        </div>

        {/* お客様情報 */}
        <div className="glass-card p-4 space-y-3">
          <p className="text-sm font-bold text-slate-800">お客様情報</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">お名前</span>
              <input className="field-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">ご来店日</span>
              <input type="date" className="field-input" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
            </label>
            <label className="block md:col-span-2">
              <span className="field-label">担当スタッフ</span>
              <input className="field-input" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
            </label>
          </div>
        </div>

        {/* メニュー */}
        <div className="glass-card p-4">
          <p className="text-sm font-bold text-slate-800 mb-2">本日の施術メニュー</p>
          <div className="flex flex-wrap gap-2">
            {MENU_OPTIONS.map((m) => {
              const checked = !!menuChecks[m];
              return (
                <button
                  key={m}
                  onClick={() => setMenuChecks((p) => ({ ...p, [m]: !p[m] }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    checked ? "bg-sise-50 border-sise-400 text-sise-700" : "bg-white border-slate-200 text-slate-500"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        {/* スコア */}
        <div className="glass-card p-4">
          <p className="text-sm font-bold text-slate-800 mb-3">体のスコア（0〜5）</p>
          <div className="flex flex-col gap-3">
            {SCORE_KEYS.map((k) => {
              const v = scores[k.key];
              return (
                <div key={k.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-700">{k.label}</span>
                    <span className="text-xs font-extrabold tabular-nums" style={{ color: trScoreColor(v) }}>{v.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={0.5}
                    value={v}
                    onChange={(e) => setScores((p) => ({ ...p, [k.key]: parseFloat(e.target.value) }))}
                    className="w-full accent-sise-500"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* コメント */}
        <div className="glass-card p-4">
          <p className="text-sm font-bold text-slate-800 mb-2">担当からのコメント</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {COMMENT_TEMPLATES.map((t) => (
              <button key={t.key} onClick={() => applyTemplate(t.key)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white border-slate-200 text-slate-500 hover:bg-slate-50">
                {t.label}
              </button>
            ))}
          </div>
          <textarea className="field-input" rows={5} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="コメント本文" />
        </div>

        {/* ストレッチ */}
        <div className="glass-card p-4">
          <p className="text-sm font-bold text-slate-800 mb-2">おすすめストレッチ</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {STRETCH_OPTIONS.map((s) => {
              const checked = !!stretchChecks[s.key];
              return (
                <button
                  key={s.key}
                  onClick={() => setStretchChecks((p) => ({ ...p, [s.key]: !p[s.key] }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    checked ? "bg-sise-50 border-sise-400 text-sise-700" : "bg-white border-slate-200 text-slate-500"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <textarea className="field-input" rows={3} value={stretchNote} onChange={(e) => setStretchNote(e.target.value)} placeholder="自由メモ（任意）" />
        </div>
      </div>

      {/* プレビュー */}
      <div className="space-y-3 lg:sticky lg:top-20 self-start">
        <button className="btn-primary w-full" onClick={exportPng} disabled={exporting}>
          {exporting ? "書き出し中…" : "PNG で保存"}
        </button>

        <div ref={captureRef} className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
          {/* ヘッダー */}
          <div className="p-5 bg-sise-50">
            <div className="text-[11px] font-bold text-sise-800 tracking-widest">KUMANOMI CARE REPORT</div>
            <div className="text-lg font-extrabold text-slate-800 mt-1.5">{customerName ? `${customerName} 様` : "お客様"}</div>
            <div className="text-xs text-slate-500 mt-1">{visitDate}{staffName && ` ・ 担当: ${staffName}`}</div>
          </div>

          <div className="p-5">
            {activeMenus.length > 0 && (
              <div className="mb-4">
                <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-1.5">TODAY&apos;S MENU</div>
                <div className="flex flex-wrap gap-1.5">
                  {activeMenus.map((m) => (
                    <span key={m} className="text-[11px] bg-sise-100 text-sise-700 px-2 py-0.5 rounded font-semibold">{m}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-1.5">BODY SCORE</div>
              {SCORE_KEYS.map((k) => {
                const v = scores[k.key] || 0;
                const pct = (v / 5) * 100;
                return (
                  <div key={k.key} className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-bold text-slate-600 w-16">{k.label}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: pct + "%", background: trScoreColor(v) }} />
                    </div>
                    <span className="text-[11px] font-extrabold w-7 text-right" style={{ color: trScoreColor(v) }}>{v.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>

            {comment.trim() && (
              <div className="mb-4">
                <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-1.5">FROM YOUR THERAPIST</div>
                <div className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">{comment.trim()}</div>
              </div>
            )}

            {(activeStretches.length > 0 || stretchNote.trim()) && (
              <div>
                <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-1.5">HOMEWORK</div>
                {activeStretches.map((s) => (
                  <div key={s.key} className="mb-2">
                    <div className="text-xs font-bold text-sise-800">◆ {s.label}</div>
                    <div className="text-[11px] text-slate-500 leading-relaxed">{s.desc}</div>
                  </div>
                ))}
                {stretchNote.trim() && (
                  <div className="mt-2 p-2.5 bg-sise-50 rounded-lg text-[11px] text-sise-900 whitespace-pre-wrap leading-relaxed">{stretchNote.trim()}</div>
                )}
              </div>
            )}
          </div>

          <div className="px-5 py-3 bg-sise-50/60 flex items-center justify-between">
            <span className="text-[11px] font-bold text-sise-800">くまのみ整体院</span>
            <span className="text-[10px] text-slate-400">SCORE AVG {avgScore.toFixed(1)} / 5.0</span>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 text-center leading-relaxed">
          「PNG で保存」でカード画像をダウンロードし、お客様へLINE等で共有できます。
        </p>
      </div>
    </div>
  );
}
