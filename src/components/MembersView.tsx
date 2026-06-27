"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayJST, addDaysISO as addDays } from "@/lib/date";
import {
  ticketStatus,
  ticketStatusLabel,
  type Customer,
  type CustomerTicket,
  type Member,
  type Store,
  type TicketPlan,
  type TicketStatus,
} from "@/lib/types";

function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

const STATUS_STYLE: Record<TicketStatus, string> = {
  active: "bg-green-100 text-green-700",
  expiring: "bg-amber-100 text-amber-700",
  expired: "bg-red-100 text-red-700",
  completed: "bg-slate-100 text-slate-500",
};

type Tab = "tickets" | "followup" | "customers" | "plans";

export default function MembersView({
  member,
  stores = [],
  initialCustomers,
  initialPlans,
  initialTickets,
  canEdit = true,
}: {
  member: Member;
  stores?: Store[];
  initialCustomers: Customer[];
  initialPlans: TicketPlan[];
  initialTickets: CustomerTicket[];
  canEdit?: boolean;
}) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("tickets");
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [plans, setPlans] = useState<TicketPlan[]>(initialPlans);
  const [tickets, setTickets] = useState<CustomerTicket[]>(initialTickets);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 店舗選択（複数店舗が見えるユーザー向け）。登録・表示は選択店舗にスコープ。
  const storeOptions = stores;
  const initialStoreId =
    storeOptions.find((s) => s.id === member.store_id)?.id ?? storeOptions[0]?.id ?? member.store_id;
  const [storeId, setStoreId] = useState(initialStoreId);

  // 選択店舗にスコープしたデータ
  const sCustomers = useMemo(() => customers.filter((c) => c.store_id === storeId), [customers, storeId]);
  const sPlans = useMemo(() => plans.filter((p) => p.store_id === storeId), [plans, storeId]);
  const sTickets = useMemo(() => tickets.filter((t) => t.store_id === storeId), [tickets, storeId]);

  // フィルタ
  const [filter, setFilter] = useState<"all" | TicketStatus>("active");
  const [query, setQuery] = useState("");

  // ===== 回数券発行フォーム =====
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [tForm, setTForm] = useState({
    customer_name: "",
    customer_phone: "",
    plan_id: "",
    purchase_date: todayJST(),
    expiration_date: "",
    note: "",
  });

  function onPlanChange(planId: string) {
    const plan = plans.find((p) => p.id === planId);
    const exp = plan ? addDays(tForm.purchase_date || todayJST(), plan.validity_days) : "";
    setTForm((p) => ({ ...p, plan_id: planId, expiration_date: exp }));
  }

  async function addTicket() {
    const name = tForm.customer_name.trim();
    if (!name || !tForm.plan_id) {
      setError("お客様名とプランを選択してください。");
      return;
    }
    const plan = plans.find((p) => p.id === tForm.plan_id);
    setBusy(true);
    setError(null);
    try {
      // 顧客マスタに自動リンク（同店舗・同名が無ければ新規作成）
      let customerId: string | null = null;
      const existing = customers.find((c) => c.store_id === storeId && c.name === name);
      if (existing) {
        customerId = existing.id;
      } else {
        const { data: cust, error: cErr } = await supabase
          .from("customers")
          .insert({ store_id: storeId, name, phone: tForm.customer_phone || null })
          .select()
          .single();
        if (cErr) throw cErr;
        customerId = (cust as Customer).id;
        setCustomers((prev) => [...prev, cust as Customer].sort((a, b) => a.name.localeCompare(b.name, "ja")));
      }

      const payload = {
        store_id: storeId,
        plan_id: tForm.plan_id,
        customer_id: customerId,
        customer_name: name,
        customer_phone: tForm.customer_phone || null,
        plan_name: plan?.name || null,
        total_sessions: plan?.sessions || 0,
        remaining_sessions: plan?.sessions || 0,
        price: plan?.price || 0,
        purchase_date: tForm.purchase_date,
        expiration_date: tForm.expiration_date || null,
        note: tForm.note || null,
      };
      const { data, error } = await supabase.from("customer_tickets").insert(payload).select().single();
      if (error) throw error;
      setTickets((prev) => [data as CustomerTicket, ...prev]);
      setTForm({
        customer_name: "",
        customer_phone: "",
        plan_id: "",
        purchase_date: todayJST(),
        expiration_date: "",
        note: "",
      });
      setShowTicketForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "発行に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function useSession(t: CustomerTicket) {
    if (t.remaining_sessions <= 0) return;
    setBusy(true);
    setError(null);
    try {
      // 行ロック付きの原子的消化（残数の同時更新でロストアップデートを防ぐ）
      const { data, error } = await supabase.rpc("consume_ticket", { p_ticket: t.id });
      if (error) throw error;
      const updated = (Array.isArray(data) ? data[0] : data) as CustomerTicket;
      setTickets((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "消化記録に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function undoSession(t: CustomerTicket) {
    if (t.remaining_sessions >= t.total_sessions) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("restore_ticket", { p_ticket: t.id });
      if (error) throw error;
      const updated = (Array.isArray(data) ? data[0] : data) as CustomerTicket;
      setTickets((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り消しに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTicket(t: CustomerTicket) {
    if (!confirm(`${t.customer_name} さんの回数券を削除しますか？`)) return;
    const { error } = await supabase.from("customer_tickets").delete().eq("id", t.id);
    if (error) {
      setError(error.message);
      return;
    }
    setTickets((prev) => prev.filter((x) => x.id !== t.id));
  }

  // ===== 会員フォーム =====
  const [cForm, setCForm] = useState({ name: "", phone: "", note: "" });
  async function addCustomer() {
    if (!cForm.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          store_id: storeId,
          name: cForm.name.trim(),
          phone: cForm.phone || null,
          note: cForm.note || null,
        })
        .select()
        .single();
      if (error) throw error;
      setCustomers((prev) => [...prev, data as Customer].sort((a, b) => a.name.localeCompare(b.name, "ja")));
      setCForm({ name: "", phone: "", note: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCustomer(c: Customer) {
    if (!confirm(`${c.name} さんを削除しますか？`)) return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) {
      setError(error.message);
      return;
    }
    setCustomers((prev) => prev.filter((x) => x.id !== c.id));
  }

  // ===== プランフォーム =====
  const [pForm, setPForm] = useState({ name: "", sessions: "", price: "", validity_days: "180" });
  async function addPlan() {
    if (!pForm.name.trim() || !pForm.sessions || !pForm.price) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("ticket_plans")
        .insert({
          store_id: storeId,
          name: pForm.name.trim(),
          sessions: parseInt(pForm.sessions, 10) || 0,
          price: parseInt(pForm.price, 10) || 0,
          validity_days: parseInt(pForm.validity_days, 10) || 180,
          active: true,
        })
        .select()
        .single();
      if (error) throw error;
      setPlans((prev) => [...prev, data as TicketPlan].sort((a, b) => a.sessions - b.sessions));
      setPForm({ name: "", sessions: "", price: "", validity_days: "180" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function deletePlan(p: TicketPlan) {
    if (!confirm(`プラン「${p.name}」を削除しますか？`)) return;
    const { error } = await supabase.from("ticket_plans").delete().eq("id", p.id);
    if (error) {
      setError(error.message);
      return;
    }
    setPlans((prev) => prev.filter((x) => x.id !== p.id));
  }

  // KPI（選択店舗）
  const stats = useMemo(() => {
    const active = sTickets.filter((t) => ticketStatus(t) === "active" || ticketStatus(t) === "expiring");
    const expiring = sTickets.filter((t) => ticketStatus(t) === "expiring");
    const remaining = active.reduce((s, t) => s + t.remaining_sessions, 0);
    const revenue = sTickets.reduce((s, t) => s + Number(t.price || 0), 0);
    return { active: active.length, expiring: expiring.length, remaining, revenue };
  }, [sTickets]);

  const filteredTickets = useMemo(() => {
    let list = sTickets;
    if (filter !== "all") list = list.filter((t) => ticketStatus(t) === filter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) => t.customer_name.toLowerCase().includes(q) || (t.customer_phone || "").includes(query)
      );
    }
    return list;
  }, [sTickets, filter, query]);

  // フォローアップ対象（期限切れ／期限間近／残りわずか）。urgency が小さいほど優先。
  const followups = useMemo(() => {
    const items = sTickets
      .map((t) => {
        const st = ticketStatus(t);
        if (st === "expired") return { t, reason: "期限切れ", urgency: 0, st };
        if (st === "expiring") return { t, reason: "期限間近", urgency: 1, st };
        if (st === "active" && t.remaining_sessions > 0 && t.remaining_sessions <= 2)
          return { t, reason: "残りわずか", urgency: 2, st };
        return null;
      })
      .filter(Boolean) as { t: CustomerTicket; reason: string; urgency: number; st: TicketStatus }[];
    return items.sort(
      (a, b) => a.urgency - b.urgency || (a.t.expiration_date || "").localeCompare(b.t.expiration_date || "")
    );
  }, [sTickets]);

  // 顧客ごとの有効回数券サマリ（会員名簿の統合表示用）。customer_id 優先、無ければ氏名で紐付け。
  const customerTicketInfo = useMemo(() => {
    const m = new Map<string, { active: number; remaining: number }>();
    for (const t of sTickets) {
      const st = ticketStatus(t);
      if (st !== "active" && st !== "expiring") continue;
      const key = t.customer_id || `name:${t.customer_name}`;
      const cur = m.get(key) || { active: 0, remaining: 0 };
      cur.active += 1;
      cur.remaining += t.remaining_sessions;
      m.set(key, cur);
    }
    return m;
  }, [sTickets]);
  const ticketInfoFor = (c: Customer) =>
    customerTicketInfo.get(c.id) || customerTicketInfo.get(`name:${c.name}`) || null;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-extrabold text-slate-900">会員・回数券</h1>
        {storeOptions.length > 1 && (
          <select
            className="text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-sise-100"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            {storeOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <p className="text-[11px] text-slate-500 mb-1">有効回数券</p>
          <p className="text-2xl font-extrabold text-sise-600">{stats.active}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11px] text-slate-500 mb-1">期限間近(30日)</p>
          <p className={`text-2xl font-extrabold ${stats.expiring > 0 ? "text-amber-600" : "text-slate-400"}`}>{stats.expiring}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11px] text-slate-500 mb-1">残セッション</p>
          <p className="text-2xl font-extrabold text-blue-600">{stats.remaining}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11px] text-slate-500 mb-1">累計売上</p>
          <p className="text-xl font-extrabold text-emerald-600">{yen(stats.revenue)}</p>
        </div>
      </div>

      {/* タブ */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
        {([
          { k: "tickets", l: "回数券" },
          { k: "followup", l: "フォロー" },
          { k: "customers", l: "会員名簿" },
          { k: "plans", l: "プラン" },
        ] as { k: Tab; l: string }[]).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`relative flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.k ? "bg-white text-sise-700 shadow-sm" : "text-slate-500"
            }`}
          >
            {t.l}
            {t.k === "followup" && followups.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold align-middle">
                {followups.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}

      {/* ===== 回数券タブ ===== */}
      {tab === "tickets" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="field-input !py-2 flex-1 min-w-[160px]"
              placeholder="お客様名・電話で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select className="field-input !py-2 w-auto" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">すべて</option>
              <option value="active">有効</option>
              <option value="expiring">期限間近</option>
              <option value="expired">期限切れ</option>
              <option value="completed">消化済</option>
            </select>
            {canEdit && (
              <button className="btn-primary !py-2" onClick={() => setShowTicketForm((v) => !v)}>＋ 発行</button>
            )}
          </div>

          {showTicketForm && (
            <div className="glass-card p-4">
              <h3 className="font-bold text-slate-800 mb-3">回数券を発行</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="field-label">お客様名 *</span>
                  <input className="field-input" value={tForm.customer_name} onChange={(e) => setTForm((p) => ({ ...p, customer_name: e.target.value }))} list="customer-names" />
                  <datalist id="customer-names">
                    {sCustomers.map((c) => <option key={c.id} value={c.name} />)}
                  </datalist>
                </label>
                <label className="block">
                  <span className="field-label">電話番号</span>
                  <input className="field-input" value={tForm.customer_phone} onChange={(e) => setTForm((p) => ({ ...p, customer_phone: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="field-label">プラン *</span>
                  <select className="field-input" value={tForm.plan_id} onChange={(e) => onPlanChange(e.target.value)}>
                    <option value="">-- 選択 --</option>
                    {sPlans.filter((p) => p.active).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}（{p.sessions}回 / {yen(p.price)}）</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">購入日</span>
                  <input type="date" className="field-input" value={tForm.purchase_date}
                    onChange={(e) => {
                      const plan = plans.find((p) => p.id === tForm.plan_id);
                      setTForm((p) => ({ ...p, purchase_date: e.target.value, expiration_date: plan ? addDays(e.target.value, plan.validity_days) : p.expiration_date }));
                    }} />
                </label>
                <label className="block">
                  <span className="field-label">有効期限</span>
                  <input type="date" className="field-input" value={tForm.expiration_date} onChange={(e) => setTForm((p) => ({ ...p, expiration_date: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="field-label">メモ</span>
                  <input className="field-input" value={tForm.note} onChange={(e) => setTForm((p) => ({ ...p, note: e.target.value }))} />
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button className="btn-ghost !py-2" onClick={() => setShowTicketForm(false)}>キャンセル</button>
                <button className="btn-primary !py-2" onClick={addTicket} disabled={busy}>{busy ? "発行中…" : "発行する"}</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {filteredTickets.map((t) => {
              const st = ticketStatus(t);
              const pct = t.total_sessions > 0 ? ((t.total_sessions - t.remaining_sessions) / t.total_sessions) * 100 : 0;
              return (
                <div key={t.id} className="glass-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-800">{t.customer_name}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[st]}`}>{ticketStatusLabel(st)}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {t.plan_name || "—"} ・ {yen(Number(t.price))}
                        {t.expiration_date && ` ・ 期限 ${t.expiration_date}`}
                      </p>
                    </div>
                    {canEdit && (
                      <button className="text-xs text-slate-300 hover:text-rose-500 shrink-0" onClick={() => deleteTicket(t)}>削除</button>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-500">残り <strong className="text-slate-800 text-sm">{t.remaining_sessions}</strong> / {t.total_sessions} 回</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-sise-400 to-sise-600 rounded-full" style={{ width: pct + "%" }} />
                      </div>
                    </div>
                    {canEdit && (
                      <>
                        <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => undoSession(t)} disabled={busy || t.remaining_sessions >= t.total_sessions}>＋1戻す</button>
                        <button className="btn-primary !py-1.5 !px-3 text-xs" onClick={() => useSession(t)} disabled={busy || t.remaining_sessions <= 0}>1回消化</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredTickets.length === 0 && (
              <div className="glass-card p-8 text-center text-sm text-slate-400">該当する回数券がありません。</div>
            )}
          </div>
        </div>
      )}

      {/* ===== フォロータブ ===== */}
      {tab === "followup" && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            期限切れ・期限間近・残りわずかの回数券です。再来店のお声がけにご活用ください。
          </p>
          {followups.length === 0 ? (
            <div className="glass-card p-8 text-center text-sm text-slate-400">
              フォローが必要な回数券はありません。
            </div>
          ) : (
            followups.map(({ t, reason }) => {
              const chip =
                reason === "期限切れ"
                  ? "bg-red-100 text-red-700"
                  : reason === "期限間近"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-blue-100 text-blue-700";
              return (
                <div key={t.id} className="glass-card p-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800">{t.customer_name}</span>
                      <span className={`chip ${chip}`}>{reason}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      残り {t.remaining_sessions}/{t.total_sessions} 回
                      {t.expiration_date && ` ・ 期限 ${t.expiration_date}`}
                    </p>
                  </div>
                  {t.customer_phone ? (
                    <a href={`tel:${t.customer_phone}`} className="btn-ghost !py-1.5 !px-3 text-xs shrink-0">
                      📞 {t.customer_phone}
                    </a>
                  ) : (
                    <span className="text-[11px] text-slate-300 shrink-0">電話未登録</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ===== 会員名簿タブ ===== */}
      {tab === "customers" && (
        <div className="space-y-3">
          {canEdit && (
          <div className="glass-card p-4">
            <h3 className="font-bold text-slate-800 mb-3">会員を追加</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block">
                <span className="field-label">お名前 *</span>
                <input className="field-input" value={cForm.name} onChange={(e) => setCForm((p) => ({ ...p, name: e.target.value }))} />
              </label>
              <label className="block">
                <span className="field-label">電話番号</span>
                <input className="field-input" value={cForm.phone} onChange={(e) => setCForm((p) => ({ ...p, phone: e.target.value }))} />
              </label>
              <label className="block">
                <span className="field-label">メモ</span>
                <input className="field-input" value={cForm.note} onChange={(e) => setCForm((p) => ({ ...p, note: e.target.value }))} />
              </label>
            </div>
            <div className="flex justify-end mt-3">
              <button className="btn-primary !py-2" onClick={addCustomer} disabled={busy || !cForm.name.trim()}>追加</button>
            </div>
          </div>
          )}

          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 bg-slate-50/60 border-b border-slate-100">
                  <th className="py-3 px-3 font-semibold">お名前</th>
                  <th className="py-3 px-3 font-semibold">電話</th>
                  <th className="py-3 px-3 font-semibold">有効回数券</th>
                  <th className="py-3 px-3 font-semibold">メモ</th>
                  <th className="py-3 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {sCustomers.map((c) => {
                  const info = ticketInfoFor(c);
                  return (
                  <tr key={c.id} className="border-b border-slate-50">
                    <td className="py-2.5 px-3 font-semibold text-slate-700">{c.name}</td>
                    <td className="py-2.5 px-3 text-slate-500">{c.phone || "—"}</td>
                    <td className="py-2.5 px-3 text-xs">
                      {info ? (
                        <span className="chip bg-sise-100 text-sise-700">{info.active}券・残{info.remaining}回</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-xs">{c.note || ""}</td>
                    <td className="py-2.5 px-2 text-right">
                      {canEdit && (
                        <button className="text-xs text-slate-300 hover:text-rose-500" onClick={() => deleteCustomer(c)}>削除</button>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {sCustomers.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400 text-sm">会員がまだ登録されていません。</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== プランタブ ===== */}
      {tab === "plans" && (
        <div className="space-y-3">
          {canEdit && (
          <div className="glass-card p-4">
            <h3 className="font-bold text-slate-800 mb-3">プランを追加</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="block">
                <span className="field-label">名称 *</span>
                <input className="field-input" placeholder="10回券" value={pForm.name} onChange={(e) => setPForm((p) => ({ ...p, name: e.target.value }))} />
              </label>
              <label className="block">
                <span className="field-label">回数 *</span>
                <input type="number" min={1} className="field-input" value={pForm.sessions} onChange={(e) => setPForm((p) => ({ ...p, sessions: e.target.value }))} />
              </label>
              <label className="block">
                <span className="field-label">価格(円) *</span>
                <input type="number" min={0} className="field-input" value={pForm.price} onChange={(e) => setPForm((p) => ({ ...p, price: e.target.value }))} />
              </label>
              <label className="block">
                <span className="field-label">有効日数</span>
                <input type="number" min={1} className="field-input" value={pForm.validity_days} onChange={(e) => setPForm((p) => ({ ...p, validity_days: e.target.value }))} />
              </label>
            </div>
            <div className="flex justify-end mt-3">
              <button className="btn-primary !py-2" onClick={addPlan} disabled={busy}>追加</button>
            </div>
          </div>
          )}

          <div className="space-y-2">
            {sPlans.map((p) => (
              <div key={p.id} className="glass-card p-4 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800">{p.name}</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">{p.sessions}回 ・ {yen(p.price)} ・ 有効{p.validity_days}日</p>
                </div>
                {canEdit && (
                  <button className="text-xs text-slate-300 hover:text-rose-500" onClick={() => deletePlan(p)}>削除</button>
                )}
              </div>
            ))}
            {sPlans.length === 0 && (
              <div className="glass-card p-8 text-center text-sm text-slate-400">プランがありません。</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
