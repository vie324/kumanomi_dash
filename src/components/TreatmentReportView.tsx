"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { todayJST } from "@/lib/posture";
import { formatDateLabel } from "@/lib/date";
import { createClient } from "@/lib/supabase/client";
import type { Genre, Member, TreatmentReportRow } from "@/lib/types";
import ReportRadar from "./ReportRadar";

type ScoreKey = { key: string; label: string };
type Template = { key: string; label: string; text: string };
type CareOption = { key: string; label: string; desc: string };

// ===== 整体（seitai） =====
const SEITAI_SCORES: ScoreKey[] = [
  { key: "posture", label: "姿勢" },
  { key: "pelvis", label: "骨盤" },
  { key: "face", label: "顔・頭" },
  { key: "metabolism", label: "代謝・巡り" },
  { key: "flex", label: "柔軟性" },
];
const SEITAI_MENUS = ["骨盤矯正", "姿勢矯正", "小顔矯正", "ほぐし", "鍼灸", "美容鍼"];
const SEITAI_TEMPLATES: Template[] = [
  { key: "maintenance", label: "継続ケア", text: "本日もご来店ありがとうございました。\n前回より状態が安定してきています。引き続き定期的なケアで維持していきましょう。" },
  { key: "first", label: "初回", text: "本日はご来店ありがとうございました。\nまずは姿勢の癖を意識する所から始めてみてください。少しずつ身体が変わっていくのを一緒に見ていきましょう。" },
  { key: "shoulder", label: "肩・首", text: "肩・首まわりの緊張が強く出ていました。お伝えしたストレッチを 1 日 1 回でも継続して頂けると効果が出やすいです。" },
  { key: "pelvis", label: "骨盤", text: "骨盤の左右差が見られました。座り方の左右クセに気をつけて、骨盤体操を毎日続けてみてください。" },
  { key: "face", label: "小顔", text: "食いしばり由来の側頭部・咬筋の張りがありました。顎の力を抜いて、お渡しした耳まわしを 1 日数回試してみてください。" },
  { key: "cold", label: "冷え", text: "むくみ・冷えのサインが強く出ていました。湯船にゆっくり浸かる + ふくらはぎのストレッチで巡りを良くしていきましょう。" },
];
const SEITAI_CARE: CareOption[] = [
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

// ===== エステ（esthe / Premium Body Balance） =====
const ESTHE_SCORES: ScoreKey[] = [
  { key: "slimness", label: "むくみ・引き締まり" },
  { key: "skin", label: "肌のハリ・ツヤ" },
  { key: "face", label: "小顔・フェイスライン" },
  { key: "posture", label: "骨盤・姿勢バランス" },
  { key: "circulation", label: "代謝・巡り" },
];
const ESTHE_MENUS = [
  // ボディ
  "痩身（キャビ/ラジオ波）", "ハンドトリートメント", "骨盤矯正", "EMS", "ヒートマット", "リンパドレナージュ",
  // フェイシャル
  "フェイシャル", "360°美顔小顔矯正", "スノーピール", "RED SHOT(美肌)", "美容鍼", "顔脱毛",
];
const ESTHE_TEMPLATES: Template[] = [
  { key: "first", label: "初回", text: "本日はご来店ありがとうございました。\nまずは3ヶ月、週1ペースの集中ケアで“戻ろうとする力”に勝ち、新しい状態を定着させていきましょう。" },
  { key: "slimming", label: "痩身", text: "施術後はめぐりが良くなっています。水分を多めに摂り、本日はゆっくりお休みください。72時間以内の有酸素運動で効果がより定着します。" },
  { key: "facial", label: "フェイシャル", text: "お肌のキメ・ハリが整いました。紫外線対策と保湿を丁寧に行い、次回までに小顔の状態をキープしていきましょう。" },
  { key: "kogao", label: "小顔矯正", text: "フェイスラインの左右差が和らぎました。食いしばり・頬杖の癖に気をつけ、お渡ししたセルフケアを続けてみてください。" },
  { key: "maintenance", label: "メンテナンス", text: "本日もありがとうございました。良い状態が定着してきています。月1〜2回のメンテナンスで美しさをキープしていきましょう。" },
  { key: "cold", label: "むくみ・冷え", text: "むくみ・冷えのサインが出ていました。湯船にゆっくり浸かり、ふくらはぎを温めて巡りを促してください。" },
];
const ESTHE_CARE: CareOption[] = [
  { key: "water", label: "水分補給", desc: "施術後は常温の水を 1.5〜2L 目安でこまめに" },
  { key: "warm", label: "湯船で温め", desc: "38〜40℃に 15 分、巡りUP（当日は長湯を避ける）" },
  { key: "lymph", label: "ふくらはぎマッサージ", desc: "下から上へさすり上げ 左右各 1 分" },
  { key: "face-roll", label: "耳まわし", desc: "耳をつまんで前後に大きく 30 秒（小顔キープ）" },
  { key: "uv", label: "UV・保湿ケア", desc: "日中はUVカット、朝晩しっかり保湿" },
  { key: "protein", label: "タンパク質を意識", desc: "1食あたり手のひら1枚分のタンパク質を" },
  { key: "walk", label: "軽い有酸素運動", desc: "施術後72時間以内のウォーキング 20 分で定着UP" },
  { key: "sleep", label: "睡眠", desc: "成長ホルモンが出る 22〜2 時にしっかり休息を" },
];

function trScoreColor(s: number): string {
  if (s >= 4) return "#16a34a";
  if (s >= 3) return "#84cc16";
  if (s >= 2) return "#f97316";
  return "#dc2626";
}

export default function TreatmentReportView({
  defaultStaff,
  genre = "seitai",
  member,
  canEdit = false,
  initialReports = [],
}: {
  defaultStaff: string;
  genre?: Genre;
  member?: Member;
  canEdit?: boolean;
  initialReports?: TreatmentReportRow[];
}) {
  const isEsthe = genre === "esthe";
  const supabase = createClient();
  const SCORE_KEYS = isEsthe ? ESTHE_SCORES : SEITAI_SCORES;
  const MENU_OPTIONS = isEsthe ? ESTHE_MENUS : SEITAI_MENUS;
  const COMMENT_TEMPLATES = isEsthe ? ESTHE_TEMPLATES : SEITAI_TEMPLATES;
  const STRETCH_OPTIONS = isEsthe ? ESTHE_CARE : SEITAI_CARE;
  const brandTitle = isEsthe ? "PREMIUM BODY BALANCE" : "KUMANOMI CARE REPORT";
  const careHeading = isEsthe ? "ホームケア・アドバイス" : "おすすめストレッチ";
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

  // 写真（Before / After）
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);

  // 次回ご来店クーポン
  const [nextOffer, setNextOffer] = useState("");
  const [nextExpiry, setNextExpiry] = useState("");

  const captureRef = useRef<HTMLDivElement | null>(null);

  // 保存・履歴
  const [reports, setReports] = useState<TreatmentReportRow[]>(initialReports);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const canSave = !!member && canEdit;

  function readPhoto(file: File | null, set: (v: string | null) => void) {
    if (!file) return set(null);
    // 大きすぎる画像は 2x キャンバス書き出しでメモリを圧迫するため上限を設ける
    if (file.size > 12 * 1024 * 1024) {
      alert("画像が大きすぎます（12MB以下を選択してください）。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => {
      set(null);
      alert("画像の読み込みに失敗しました。");
    };
    reader.readAsDataURL(file);
  }

  // テーマ色（エステ=トープ / 整体=オレンジ）。レーダー/PNGの色に使用。
  const themeColor = isEsthe ? "#97796d" : "#f97316";
  const radarData = SCORE_KEYS.map((k) => ({ axis: k.label, value: scores[k.key] || 0 }));

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
    setBeforePhoto(null);
    setAfterPhoto(null);
    setNextOffer("");
    setNextExpiry("");
  }

  async function saveReport() {
    if (!member) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      const payload = {
        store_id: member.store_id,
        member_id: member.id,
        customer_name: customerName.trim() || null,
        visit_date: visitDate,
        genre,
        staff_name: staffName.trim() || null,
        menus: activeMenus,
        scores,
        avg_score: Number(avgScore.toFixed(2)),
        comment: comment.trim() || null,
        care: activeStretches.map((s) => s.key),
        care_note: stretchNote.trim() || null,
        next_offer: nextOffer.trim() || null,
        next_expiry: nextExpiry || null,
      };
      const { data, error } = await supabase.from("treatment_reports").insert(payload).select().single();
      if (error) throw error;
      setReports((prev) => [data as TreatmentReportRow, ...prev]);
      setSavedMsg("保存しました");
      setTimeout(() => setSavedMsg(null), 2500);
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  function loadReport(r: TreatmentReportRow) {
    setCustomerName(r.customer_name || "");
    setVisitDate(r.visit_date);
    setStaffName(r.staff_name || defaultStaff);
    setComment(r.comment || "");
    setStretchNote(r.care_note || "");
    setNextOffer(r.next_offer || "");
    setNextExpiry(r.next_expiry || "");
    setMenuChecks(Object.fromEntries((r.menus || []).map((m) => [m, true])));
    setStretchChecks(Object.fromEntries((r.care || []).map((k) => [k, true])));
    if (r.scores) setScores((prev) => ({ ...prev, ...r.scores }));
    setBeforePhoto(null);
    setAfterPhoto(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
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

        {/* ストレッチ / ホームケア */}
        <div className="glass-card p-4">
          <p className="text-sm font-bold text-slate-800 mb-2">{careHeading}</p>
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

        {/* 写真 Before / After */}
        <div className="glass-card p-4">
          <p className="text-sm font-bold text-slate-800 mb-2">写真（Before / After・任意）</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Before", val: beforePhoto, set: setBeforePhoto },
              { label: "After", val: afterPhoto, set: setAfterPhoto },
            ].map((p) => (
              <div key={p.label}>
                <span className="field-label">{p.label}</span>
                {p.val ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.val} alt={p.label} className="w-full aspect-[3/4] object-cover rounded-xl border border-slate-200" />
                    <button
                      className="absolute top-1 right-1 text-[10px] bg-black/55 text-white px-2 py-0.5 rounded"
                      onClick={() => p.set(null)}
                    >
                      削除
                    </button>
                  </div>
                ) : (
                  <label className="flex aspect-[3/4] items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-400 cursor-pointer hover:bg-slate-50">
                    ＋ 写真を選択
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => readPhoto(e.target.files?.[0] ?? null, p.set)}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 次回ご来店特典 */}
        <div className="glass-card p-4">
          <p className="text-sm font-bold text-slate-800 mb-2">次回ご来店特典（任意）</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">特典内容</span>
              <input className="field-input" value={nextOffer} onChange={(e) => setNextOffer(e.target.value)} placeholder="例：次回ボディ10%OFF" />
            </label>
            <label className="block">
              <span className="field-label">有効期限</span>
              <input type="date" className="field-input" value={nextExpiry} onChange={(e) => setNextExpiry(e.target.value)} />
            </label>
          </div>
        </div>

        {/* 保存済みレポート（顧客履歴） */}
        {reports.length > 0 && (
          <div className="glass-card p-4">
            <p className="text-sm font-bold text-slate-800 mb-2">保存済みレポート（最近）</p>
            <div className="flex flex-col gap-1.5">
              {reports.slice(0, 12).map((r) => (
                <button
                  key={r.id}
                  onClick={() => loadReport(r)}
                  className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-white hover:border-sise-200 hover:bg-sise-50/40 text-left transition-colors"
                >
                  <span className="text-[11px] font-bold text-slate-500 w-16 tabular-nums">{formatDateLabel(r.visit_date)}</span>
                  <span className="text-xs text-slate-700 flex-1 truncate">{r.customer_name || "（無名）"}</span>
                  {r.avg_score != null && (
                    <span className="chip bg-sise-100 text-sise-700">平均 {Number(r.avg_score).toFixed(1)}</span>
                  )}
                  <span className="text-[10px] text-slate-400">読込</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* プレビュー */}
      <div className="space-y-3 lg:sticky lg:top-20 self-start">
        <div className="flex gap-2">
          {canSave && (
            <button className="btn-ghost flex-1" onClick={saveReport} disabled={saving}>
              {saving ? "保存中…" : "履歴に保存"}
            </button>
          )}
          <button className="btn-primary flex-1" onClick={exportPng} disabled={exporting}>
            {exporting ? "書き出し中…" : "PNG で保存"}
          </button>
        </div>
        {savedMsg && <p className="text-xs font-semibold text-emerald-600 text-center">{savedMsg}</p>}

        <div ref={captureRef} className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
          {/* ヘッダー */}
          <div className="p-5 bg-sise-50">
            <div className="text-[11px] font-bold text-sise-800 tracking-widest">{brandTitle}</div>
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
              <div className="grid grid-cols-2 gap-2 items-center">
                {/* レーダーチャート */}
                <div className="-ml-1">
                  <ReportRadar data={radarData} color={themeColor} />
                </div>
                {/* 項目バー */}
                <div>
                  {SCORE_KEYS.map((k) => {
                    const v = scores[k.key] || 0;
                    const pct = (v / 5) * 100;
                    return (
                      <div key={k.key} className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[10px] font-bold text-slate-600 w-[4.5rem] leading-tight">{k.label}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: pct + "%", background: trScoreColor(v) }} />
                        </div>
                        <span className="text-[10px] font-extrabold w-6 text-right" style={{ color: trScoreColor(v) }}>{v.toFixed(1)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 写真 Before/After */}
            {(beforePhoto || afterPhoto) && (
              <div className="mb-4">
                <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-1.5">BEFORE / AFTER</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Before", val: beforePhoto },
                    { label: "After", val: afterPhoto },
                  ].map((p) => (
                    <div key={p.label} className="rounded-lg overflow-hidden border border-slate-100 bg-slate-50">
                      {p.val ? (
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.val} alt={p.label} className="w-full aspect-[3/4] object-cover" />
                          <span className="absolute top-1 left-1 text-[9px] font-bold bg-black/55 text-white px-1.5 py-0.5 rounded">{p.label}</span>
                        </div>
                      ) : (
                        <div className="aspect-[3/4] grid place-items-center text-[10px] text-slate-300">{p.label} なし</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {comment.trim() && (
              <div className="mb-4">
                <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-1.5">FROM YOUR THERAPIST</div>
                <div className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">{comment.trim()}</div>
              </div>
            )}

            {(activeStretches.length > 0 || stretchNote.trim()) && (
              <div>
                <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-1.5">{isEsthe ? "HOME CARE" : "HOMEWORK"}</div>
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

            {/* 次回ご来店特典 */}
            {nextOffer.trim() && (
              <div className="mt-4 rounded-xl border-2 border-dashed border-sise-300 bg-sise-50/50 p-3 text-center">
                <div className="text-[10px] font-bold text-sise-700 tracking-widest">NEXT VISIT</div>
                <div className="text-sm font-extrabold text-slate-800 mt-0.5">{nextOffer.trim()}</div>
                {nextExpiry && <div className="text-[10px] text-slate-500 mt-0.5">有効期限：{nextExpiry}</div>}
              </div>
            )}
          </div>

          <div className="px-5 py-3 bg-sise-50/60 flex items-center justify-between">
            <span className="text-[11px] font-bold text-sise-800">{isEsthe ? "Premium Body Balance" : "くまのみ整体院"}</span>
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
