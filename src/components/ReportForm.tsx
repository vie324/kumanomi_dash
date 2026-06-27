"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  SUBSCRIPTION_PLANS,
  TICKET_PLANS,
  type ContractType,
  type MediaChannel,
  type Member,
  type MenuPlan,
  type Store,
} from "@/lib/types";
import AiFeedbackCard, { type FeedbackData } from "./AiFeedbackCard";

type MemoDraft = {
  outcome: "won" | "lost";
  channel: string;
  amount: string; // 契約金額（円）。メニュー選択で自動補完、手入力も可
  sessions: string; // 回数。メニュー選択で自動補完、手入力も可
  contract_type: ContractType | null;
  contract_plan: number | null;
  menu_plan_id: string; // エステ: 契約したメニュー（グループ）
  customer_name: string;
  customer_attr: string;
  reason: string;
};

function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const emptyMemo = (outcome: "won" | "lost"): MemoDraft => ({
  outcome,
  channel: "",
  amount: "",
  sessions: "",
  contract_type: outcome === "won" ? "ticket" : null,
  contract_plan: outcome === "won" ? TICKET_PLANS[0] : null,
  menu_plan_id: "",
  customer_name: "",
  customer_attr: "",
  reason: "",
});

function NumberField({
  label,
  value,
  onChange,
  color = "slate",
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  color?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className={`block text-[11px] font-semibold text-${color}-500 mb-1`}>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        className="field-input text-center !py-2"
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
      {hint && <span className="block text-[10px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

export default function ReportForm({
  member,
  store,
  channels,
  menuPlans = [],
  workStores = [],
}: {
  member: Member;
  store: Store | null;
  channels: MediaChannel[];
  menuPlans?: MenuPlan[];
  workStores?: Store[]; // 勤務店舗の候補（同業態。ヘルプ先計上用）
}) {
  const supabase = createClient();
  const isEsthe = member.genre === "esthe";

  const [reportDate, setReportDate] = useState(todayJST());
  // 勤務店舗（既定=自店。ヘルプ日は別店舗を選択しその店に計上）
  const [workStoreId, setWorkStoreId] = useState(member.store_id);
  const [revenue, setRevenue] = useState(0);
  // エステ追加項目
  const [productSales, setProductSales] = useState(0);
  const [newProductSales, setNewProductSales] = useState(0);
  const [renewalContracts, setRenewalContracts] = useState(0);
  const [otherAmount, setOtherAmount] = useState(0);
  const [otherNote, setOtherNote] = useState("");
  const [existingTreatments, setExistingTreatments] = useState(0);
  const [nextReservations, setNextReservations] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [secondVisit, setSecondVisit] = useState(0);
  const [reflection, setReflection] = useState("");
  const [tomorrowAction, setTomorrowAction] = useState("");
  const [memos, setMemos] = useState<MemoDraft[]>([]);

  const [reportId, setReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const resetForm = useCallback(() => {
    setReportId(null);
    setWorkStoreId(member.store_id);
    setRevenue(0);
    setProductSales(0);
    setNewProductSales(0);
    setRenewalContracts(0);
    setOtherAmount(0);
    setOtherNote("");
    setExistingTreatments(0);
    setNextReservations(0);
    setNewCount(0);
    setSecondVisit(0);
    setReflection("");
    setTomorrowAction("");
    setMemos([]);
  }, [member.store_id]);

  const loadExisting = useCallback(
    async (date: string) => {
      setLoading(true);
      setFeedback(null);
      setMessage(null);
      setError(null);
      const { data: report } = await supabase
        .from("daily_reports")
        .select("*")
        .eq("member_id", member.id)
        .eq("report_date", date)
        .maybeSingle();

      if (report) {
        setReportId(report.id);
        setWorkStoreId(report.store_id || member.store_id);
        setRevenue(Number(report.revenue) || 0);
        setProductSales(Number(report.product_sales) || 0);
        setNewProductSales(Number(report.new_product_sales) || 0);
        setRenewalContracts(report.renewal_contracts || 0);
        setOtherAmount(Number(report.other_amount) || 0);
        setOtherNote(report.other_note || "");
        setExistingTreatments(report.existing_treatments || 0);
        setNextReservations(report.next_reservations || 0);
        setNewCount(report.new_count || 0);
        setSecondVisit(report.second_visit_reservations || 0);
        setReflection(report.reflection || "");
        setTomorrowAction(report.tomorrow_action || "");

        const { data: memoRows } = await supabase
          .from("contract_memos")
          .select("*")
          .eq("report_id", report.id)
          .order("created_at", { ascending: true });
        setMemos(
          (memoRows || []).map((m) => ({
            outcome: m.outcome,
            channel: m.channel || "",
            amount: m.amount != null ? String(m.amount) : "",
            sessions: m.menu_sessions != null ? String(m.menu_sessions) : "",
            contract_type: m.contract_type ?? (m.outcome === "won" ? "ticket" : null),
            contract_plan: m.contract_plan ?? (m.outcome === "won" ? TICKET_PLANS[0] : null),
            // DB は実 plan(UUID)。UI はグループキー（section|group）に戻す。
            menu_plan_id: (() => {
              const p = m.menu_plan_id ? menuPlans.find((x) => x.id === m.menu_plan_id) : undefined;
              return p ? `${p.section}|${p.group_name}` : "";
            })(),
            customer_name: m.customer_name || "",
            customer_attr: m.customer_attr || "",
            reason: m.reason || "",
          }))
        );

        const { data: fb } = await supabase
          .from("ai_feedback")
          .select("*")
          .eq("report_id", report.id)
          .maybeSingle();
        if (fb) setFeedback(fb as FeedbackData);
      } else {
        resetForm();
      }
      setLoading(false);
    },
    [member.id, member.store_id, supabase, resetForm]
  );

  useEffect(() => {
    loadExisting(reportDate);
  }, [reportDate, loadExisting]);

  const updateMemo = (i: number, patch: Partial<MemoDraft>) =>
    setMemos((p) => p.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const removeMemo = (i: number) => setMemos((p) => p.filter((_, idx) => idx !== i));

  function setContractType(i: number, t: ContractType) {
    const firstPlan = t === "ticket" ? TICKET_PLANS[0] : SUBSCRIPTION_PLANS[0];
    updateMemo(i, { contract_type: t, contract_plan: firstPlan });
  }

  async function handleSave(generateAi: boolean) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        // 勤務店舗（ヘルプ先計上）。読み込みでは workStoreId に復元される。
        store_id: workStoreId,
        member_id: member.id,
        report_date: reportDate,
        revenue,
        existing_treatments: existingTreatments,
        next_reservations: nextReservations,
        new_count: newCount,
        second_visit_reservations: secondVisit,
        reflection: reflection || null,
        tomorrow_action: tomorrowAction || null,
        // エステ追加項目（整体は 0/空）
        product_sales: isEsthe ? productSales : 0,
        new_product_sales: isEsthe ? newProductSales : 0,
        renewal_contracts: isEsthe ? renewalContracts : 0,
        other_amount: isEsthe ? otherAmount : 0,
        other_note: isEsthe ? otherNote || null : null,
      };
      const { data: saved, error: saveErr } = await supabase
        .from("daily_reports")
        .upsert(payload, { onConflict: "member_id,report_date" })
        .select()
        .single();
      if (saveErr) throw saveErr;
      const rid: string = saved.id;
      setReportId(rid);

      // メモを置き換え
      await supabase.from("contract_memos").delete().eq("report_id", rid);
      const memoRows = memos
        .filter((m) => m.outcome === "won" || m.reason || m.customer_name)
        .map((m) => {
          const won = m.outcome === "won";
          const amt = m.amount ? Math.max(0, parseInt(m.amount, 10) || 0) : null;
          const sess = m.sessions ? Math.max(0, parseInt(m.sessions, 10) || 0) : null;
          // menu_plan_id（UI）はグループキー。保存時は実在する plan(UUID) に解決。
          const grp = isEsthe && m.menu_plan_id ? groupById.get(m.menu_plan_id) : undefined;
          const resolvedPlan = grp
            ? grp.plans.find((p) => p.sessions === sess) ?? grp.plans[0]
            : undefined;
          return {
            report_id: rid,
            store_id: workStoreId,
            member_id: member.id,
            outcome: m.outcome,
            channel: m.channel || null,
            // 金額・回数は選択でも手入力でも保存（紹介割など変動に対応）
            amount: won ? amt : null,
            menu_sessions: won ? sess : null,
            // エステ: メニュー（グループ）連携。整体: 回数券/定額。
            menu_plan_id: won && resolvedPlan ? resolvedPlan.id : null,
            menu_label: won && grp ? grp.groupName : null,
            contract_type: won && !isEsthe ? m.contract_type : null,
            contract_plan: won && !isEsthe ? m.contract_plan : null,
            customer_name: m.customer_name || null,
            customer_attr: m.customer_attr || null,
            reason: m.reason || null,
          };
        });
      if (memoRows.length > 0) {
        const { error: memoErr } = await supabase.from("contract_memos").insert(memoRows);
        if (memoErr) throw memoErr;
      }

      setMessage("日報を保存しました。");

      if (generateAi) {
        setFeedbackLoading(true);
        setFeedback(null);
        const res = await fetch("/api/ai-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId: rid, force: true }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "AIフィードバックの生成に失敗しました");
        setFeedback(json.feedback as FeedbackData);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
      setFeedbackLoading(false);
    }
  }

  const wonCount = memos.filter((m) => m.outcome === "won").length;
  const reservationRatePct =
    existingTreatments > 0 ? Math.round((nextReservations / existingTreatments) * 100) : 0;

  // 契約内容セレクトは「メニュー（グループ）」単位に簡素化（探しやすさ向上）。
  // section 見出し > グループ名（代表1件）。回数/金額は別途 選択/手入力。
  type MenuGroup = { id: string; groupName: string; section: string; plans: MenuPlan[] };
  const menuGroupsBySection = (() => {
    const sectionOrder: string[] = [];
    const groupMap = new Map<string, MenuGroup>(); // key: section|group
    for (const p of menuPlans) {
      const key = `${p.section}|${p.group_name}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { id: key, groupName: p.group_name, section: p.section, plans: [] });
        if (!sectionOrder.includes(p.section)) sectionOrder.push(p.section);
      }
      groupMap.get(key)!.plans.push(p);
    }
    return sectionOrder.map((section) => ({
      section,
      groups: Array.from(groupMap.values()).filter((g) => g.section === section),
    }));
  })();
  const groupById = new Map<string, MenuGroup>();
  for (const s of menuGroupsBySection) for (const g of s.groups) groupById.set(g.id, g);

  // 選択中グループの 回数・金額 候補
  function sessionOptions(groupKey: string): number[] {
    const g = groupById.get(groupKey);
    if (!g) return [];
    return Array.from(new Set(g.plans.map((p) => p.sessions).filter((v): v is number => v != null))).sort((a, b) => a - b);
  }
  function priceForSessions(groupKey: string, sessions: number | null): number | null {
    const g = groupById.get(groupKey);
    if (!g) return null;
    const hit = sessions != null ? g.plans.find((p) => p.sessions === sessions) : g.plans[0];
    return hit?.price ?? null;
  }

  // メニュー選択時に 回数/金額 を自動補完（手入力で上書き可）
  function onSelectMenu(i: number, groupKey: string) {
    const sess = sessionOptions(groupKey);
    const firstSess = sess.length > 0 ? sess[0] : null;
    const price = priceForSessions(groupKey, firstSess);
    updateMemo(i, {
      menu_plan_id: groupKey,
      sessions: firstSess != null ? String(firstSess) : "",
      amount: price != null ? String(price) : "",
    });
  }
  function onSelectSessions(i: number, groupKey: string, sessions: string) {
    const n = sessions ? parseInt(sessions, 10) : null;
    const price = priceForSessions(groupKey, n);
    updateMemo(i, { sessions, ...(price != null ? { amount: String(price) } : {}) });
  }

  const secondVisitRatePct = newCount > 0 ? Math.round((secondVisit / newCount) * 100) : 0;

  if (loading) {
    return <div className="text-center py-16 text-slate-400 text-sm">読み込み中…</div>;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 日付・勤務店舗・売上 */}
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="field-label">日付</span>
            <input
              type="date"
              className="field-input"
              value={reportDate}
              max={todayJST()}
              onChange={(e) => setReportDate(e.target.value)}
            />
          </label>
          {workStores.length > 1 && (
            <label className="block">
              <span className="field-label">勤務店舗</span>
              <select
                className="field-input"
                value={workStoreId}
                onChange={(e) => setWorkStoreId(e.target.value)}
              >
                {workStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.id === member.store_id ? "（自店）" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block flex-1 min-w-[160px]">
            <span className="field-label">個人売上（円）</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="field-input"
              value={revenue === 0 ? "" : revenue}
              placeholder="0"
              onChange={(e) => setRevenue(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
        </div>
        {workStoreId !== member.store_id && (
          <p className="mt-2 text-[11px] text-amber-600 font-semibold">
            ヘルプ勤務：この日の売上・成績は「{workStores.find((s) => s.id === workStoreId)?.name}」に計上されます。
          </p>
        )}
      </section>

      {/* エステ追加項目（物販・継続・その他） */}
      {isEsthe && (
        <section className="glass-card p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-3">物販・継続・その他</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumberField label="物販売上（円）" color="orange" value={productSales} onChange={setProductSales} />
            <NumberField label="新規の物販売上（円）" color="blue" value={newProductSales} onChange={setNewProductSales} />
            <NumberField label="継続契約（件）" color="emerald" value={renewalContracts} onChange={setRenewalContracts} />
            <NumberField label="その他（円）" color="slate" value={otherAmount} onChange={setOtherAmount} />
          </div>
          <label className="block mt-3">
            <span className="field-label">その他メモ</span>
            <input
              className="field-input"
              value={otherNote}
              onChange={(e) => setOtherNote(e.target.value)}
              placeholder="その他売上の内訳など"
            />
          </label>
        </section>
      )}

      {/* 既存施術 → 次回予約（整体・エステ共通） */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3">施術数（既存のみ）</h2>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <NumberField
            label={isEsthe ? "施術数（新規を含めない）" : "施術数（新患を含めない）"}
            color="orange"
            value={existingTreatments}
            onChange={setExistingTreatments}
          />
          <NumberField
            label={isEsthe ? "うち 既存客の次回予約数" : "うち 次回予約数"}
            color="emerald"
            value={nextReservations}
            onChange={setNextReservations}
          />
        </div>
        {existingTreatments > 0 && (
          <p className="text-xs text-slate-500 mt-2">次回予約率 <span className="font-bold text-emerald-600">{reservationRatePct}%</span></p>
        )}
      </section>

      {/* 新規 → 2回目予約 */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3">新規</h2>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <NumberField label="新規数" color="blue" value={newCount} onChange={setNewCount} />
          <NumberField label="うち 2回目予約につながった数" color="emerald" value={secondVisit} onChange={setSecondVisit} />
        </div>
        {newCount > 0 && (
          <p className="text-xs text-slate-500 mt-2">2回目予約転換率 <span className="font-bold text-emerald-600">{secondVisitRatePct}%</span></p>
        )}
      </section>

      {/* 新規のお客様ごとの契約記録 */}
      <section className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">新規のお客様ごとの契約記録</h2>
            <p className="text-[11px] text-slate-400">契約の有無・内容と、取れた/取れなかった理由を残してください</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setMemos((p) => [...p, emptyMemo("won")])}>
              ＋ 契約あり
            </button>
            <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setMemos((p) => [...p, emptyMemo("lost")])}>
              ＋ 契約なし
            </button>
          </div>
        </div>

        {memos.length === 0 && (
          <p className="text-xs text-slate-400">「契約あり」「契約なし」ボタンで、新規のお客様ごとに記録を追加できます。</p>
        )}

        <div className="space-y-3">
          {memos.map((m, i) => (
            <div
              key={i}
              className={`rounded-xl border p-3 ${m.outcome === "won" ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold ${m.outcome === "won" ? "text-emerald-700" : "text-rose-700"}`}>
                  {m.outcome === "won" ? "✓ 契約あり" : "✗ 契約なし"}
                </span>
                <button type="button" className="text-xs text-slate-400 hover:text-rose-500" onClick={() => removeMemo(i)}>
                  削除
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-1">媒体（どこから来たお客様か）</span>
                  <select
                    className="field-input !py-2"
                    value={m.channel}
                    onChange={(e) => updateMemo(i, { channel: e.target.value })}
                  >
                    <option value="">-- 媒体を選択 --</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                    {/* 既存データに無い値が入っていた場合も表示 */}
                    {m.channel && !channels.some((c) => c.name === m.channel) && (
                      <option value={m.channel}>{m.channel}</option>
                    )}
                  </select>
                </label>
                {channels.find((c) => c.name === m.channel)?.unit_price && (
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 mb-1">単価（円）</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="field-input !py-2"
                      placeholder="0"
                      value={m.amount}
                      onChange={(e) => updateMemo(i, { amount: e.target.value })}
                    />
                  </label>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-1">お客様（呼称・任意）</span>
                  <input className="field-input !py-2" value={m.customer_name} onChange={(e) => updateMemo(i, { customer_name: e.target.value })} />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-1">属性（年代/主訴等・任意）</span>
                  <input className="field-input !py-2" value={m.customer_attr} onChange={(e) => updateMemo(i, { customer_attr: e.target.value })} />
                </label>
              </div>

              {/* 契約内容（契約ありのみ・エステ）: メニュー選択 + 回数/金額（選択・手入力両対応） */}
              {m.outcome === "won" && isEsthe && (
                <div className="mb-2 rounded-lg bg-white/70 border border-emerald-100 p-2.5 space-y-2">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 mb-1">契約メニュー</p>
                    <select
                      className="field-input !py-2"
                      value={m.menu_plan_id}
                      onChange={(e) => onSelectMenu(i, e.target.value)}
                    >
                      <option value="">-- メニューを選択 --</option>
                      {menuGroupsBySection.map((s) => (
                        <optgroup key={s.section} label={s.section}>
                          {s.groups.map((g) => (
                            <option key={g.id} value={g.id}>{g.groupName}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[11px] text-slate-500 mb-1">回数（選択 or 入力）</span>
                      <input
                        className="field-input !py-2"
                        inputMode="numeric"
                        list={`sess-${i}`}
                        value={m.sessions}
                        onChange={(e) => onSelectSessions(i, m.menu_plan_id, e.target.value)}
                        placeholder="例: 8"
                      />
                      <datalist id={`sess-${i}`}>
                        {sessionOptions(m.menu_plan_id).map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                    </label>
                    <label className="block">
                      <span className="block text-[11px] text-slate-500 mb-1">金額（円・変更可）</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        className="field-input !py-2"
                        value={m.amount}
                        onChange={(e) => updateMemo(i, { amount: e.target.value })}
                        placeholder="紹介割等は手入力"
                      />
                    </label>
                  </div>
                  {menuPlans.length === 0 && (
                    <p className="text-[11px] text-amber-600">料金表メニューが未登録です。管理画面で登録してください。</p>
                  )}
                </div>
              )}
              {m.outcome === "won" && !isEsthe && (
                <div className="mb-2 rounded-lg bg-white/70 border border-emerald-100 p-2.5">
                  <p className="text-[11px] font-semibold text-slate-500 mb-2">契約内容</p>
                  <div className="flex gap-2 mb-2">
                    {(["ticket", "subscription"] as ContractType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setContractType(i, t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          m.contract_type === t
                            ? "bg-sise-500 text-white border-sise-500"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {t === "ticket" ? "回数券" : "定額"}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(m.contract_type === "ticket" ? TICKET_PLANS : SUBSCRIPTION_PLANS).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => updateMemo(i, { contract_plan: p })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          m.contract_plan === p
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {m.contract_type === "ticket" ? `${p}回` : `月${p}回`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="block">
                <span className="block text-[11px] text-slate-500 mb-1">
                  {m.outcome === "won" ? "契約できた理由・決め手" : "契約に至らなかった理由"}
                </span>
                <textarea
                  className="field-input !py-2"
                  rows={2}
                  value={m.reason}
                  onChange={(e) => updateMemo(i, { reason: e.target.value })}
                />
              </label>
            </div>
          ))}
        </div>

        {memos.length > 0 && (
          <p className="text-[11px] text-slate-400 mt-2">契約あり {wonCount}件 / 記録 {memos.length}件</p>
        )}
      </section>

      {/* 今日の振り返り */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-2">今日の振り返り</h2>
        <textarea
          className="field-input"
          rows={3}
          placeholder="今日うまくいったこと・課題に感じたこと"
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
        />
      </section>

      {/* 明日の行動 */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-2">明日の行動</h2>
        <textarea
          className="field-input"
          rows={3}
          placeholder="明日の行動計画等"
          value={tomorrowAction}
          onChange={(e) => setTomorrowAction(e.target.value)}
        />
      </section>

      {message && <p className="text-sm text-emerald-600 font-semibold">{message}</p>}
      {error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-3 sticky bottom-3 z-10">
        <button className="btn-ghost flex-1" onClick={() => handleSave(false)} disabled={saving}>
          {saving ? "保存中…" : "保存のみ"}
        </button>
        <button className="btn-primary flex-1" onClick={() => handleSave(true)} disabled={saving || feedbackLoading}>
          {feedbackLoading ? "AI分析中…" : "保存してAIフィードバック"}
        </button>
      </div>

      {(feedback || feedbackLoading) && <AiFeedbackCard feedback={feedback} loading={feedbackLoading} />}
    </div>
  );
}
