"use client";

import { useState, useTransition } from "react";
import {
  createStaffMember,
  deleteStaffMember,
  setMemberStores,
  updateMemberRole,
} from "@/app/admin/actions";
import { defaultScope } from "@/lib/permissions";
import {
  ROLE_LABELS,
  ROLE_ORDER,
  type Department,
  type Member,
  type Role,
  type Scope,
  type Store,
} from "@/lib/types";

const SCOPE_LABELS: Record<Scope, string> = {
  all: "全社",
  department: "部門内",
  assigned: "担当店舗",
  store: "自店舗",
  own: "自分のみ",
};
const SCOPES: Scope[] = ["all", "department", "assigned", "store", "own"];

export default function MemberAdminTable({
  members,
  stores,
  departments,
  accessMap,
  currentMemberId,
  defaultStoreId,
}: {
  members: Member[];
  stores: Store[];
  departments: Department[];
  accessMap: Record<string, string[]>;
  currentMemberId: string;
  defaultStoreId: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <AddStaffForm stores={stores} defaultStoreId={defaultStoreId} />

      <div className="space-y-2">
        {members.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            stores={stores}
            departments={departments}
            assignedStores={accessMap[m.id] || []}
            isSelf={m.id === currentMemberId}
            expanded={editing === m.id}
            onToggle={() => setEditing((e) => (e === m.id ? null : m.id))}
          />
        ))}
        {members.length === 0 && (
          <div className="glass-card p-8 text-center text-sm text-slate-400">スタッフが登録されていません。</div>
        )}
      </div>
    </div>
  );
}

function AddStaffForm({ stores, defaultStoreId }: { stores: Store[]; defaultStoreId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storeId, setStoreId] = useState(defaultStoreId);
  const [role, setRole] = useState<Role>("staff");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setMsg(null);
    setError(null);
    startTransition(async () => {
      try {
        await createStaffMember({ name, email, password, storeId, role });
        setMsg(`${name} さんを追加しました`);
        setName("");
        setEmail("");
        setPassword("");
        setRole("staff");
        setTimeout(() => setMsg(null), 3000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "追加に失敗しました");
      }
    });
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <button className="btn-primary !py-2" onClick={() => setOpen(true)}>＋ スタッフを追加</button>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-800">スタッフを追加</h3>
        <button className="text-xs text-slate-400 hover:text-slate-700" onClick={() => setOpen(false)}>閉じる</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="field-label">氏名 *</span>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">メールアドレス（ログインID）*</span>
          <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">初期パスワード *（6文字以上）</span>
          <input className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="例: Kumanomi2026!" />
        </label>
        <label className="block">
          <span className="field-label">店舗</span>
          <select className="field-input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">役割</span>
          <select className="field-input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button className="btn-primary !py-2" onClick={submit} disabled={pending || !name.trim() || !email.trim() || password.length < 6}>
          {pending ? "追加中…" : "追加する"}
        </button>
        {msg && <span className="text-sm text-emerald-600 font-semibold">{msg}</span>}
        {error && <span className="text-sm text-rose-600 font-semibold">{error}</span>}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">
        ※ 追加後すぐにこのメール・パスワードでログインできます（メール確認は不要）。本人に共有してください。
      </p>
    </div>
  );
}

function storeName(stores: Store[], id: string) {
  return stores.find((s) => s.id === id)?.name || id;
}

function MemberRow({
  member,
  stores,
  departments,
  assignedStores,
  isSelf,
  expanded,
  onToggle,
}: {
  member: Member;
  stores: Store[];
  departments: Department[];
  assignedStores: string[];
  isSelf: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [role, setRole] = useState<Role>(member.role);
  const [scope, setScope] = useState<Scope>(member.scope ?? defaultScope(member.role));
  const [departmentId, setDepartmentId] = useState<string | null>(member.department_id);
  const [storeIds, setStoreIds] = useState<string[]>(assignedStores);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onRoleChange(r: Role) {
    setRole(r);
    setScope(defaultScope(r)); // 役割を変えたら既定スコープに合わせる（手動変更も可）
  }

  function toggleStore(id: string) {
    setStoreIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function save() {
    setMsg(null);
    setError(null);
    startTransition(async () => {
      try {
        await updateMemberRole({ memberId: member.id, role, scope, departmentId });
        if (scope === "assigned") {
          await setMemberStores(member.id, storeIds);
        }
        setMsg("保存しました");
        setTimeout(() => setMsg(null), 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  function remove() {
    if (!confirm(`${member.name} さんを削除しますか？\nログインアカウントも削除されます。日報など過去の記録は残ります。`)) return;
    setMsg(null);
    setError(null);
    startTransition(async () => {
      try {
        await deleteStaffMember(member.id);
        // 画面は revalidate で更新される
      } catch (e) {
        setError(e instanceof Error ? e.message : "削除に失敗しました");
      }
    });
  }

  return (
    <div className="glass-card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50/50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-800">{member.name}</span>
            {isSelf && <span className="text-[10px] bg-sise-100 text-sise-700 px-1.5 py-0.5 rounded font-semibold">自分</span>}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{member.email || "—"}</p>
        </div>
        <span className="text-xs font-semibold text-slate-600 px-2 py-1 rounded-lg bg-slate-100">{ROLE_LABELS[member.role]}</span>
        <span className="text-[11px] text-slate-400">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/30">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block">
              <span className="field-label">役割</span>
              <select className="field-input" value={role} onChange={(e) => onRoleChange(e.target.value as Role)}>
                {ROLE_ORDER.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">データ範囲</span>
              <select className="field-input" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                {SCOPES.map((s) => (
                  <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">部門</span>
              <select
                className="field-input"
                value={departmentId ?? ""}
                onChange={(e) => setDepartmentId(e.target.value || null)}
              >
                <option value="">（未設定）</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          </div>

          {scope === "assigned" && (
            <div>
              <span className="field-label">担当店舗（複数選択可）</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {stores.map((s) => {
                  const checked = storeIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleStore(s.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        checked ? "bg-sise-50 border-sise-400 text-sise-700" : "bg-white border-slate-200 text-slate-500"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
              {storeIds.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">担当店舗が未選択です（自店舗のみアクセス可になります）。</p>
              )}
            </div>
          )}

          {scope !== "assigned" && assignedStores.length > 0 && (
            <p className="text-[11px] text-slate-400">
              （担当店舗の割当あり: {assignedStores.map((id) => storeName(stores, id)).join("・")}。データ範囲を「担当店舗」にすると有効になります）
            </p>
          )}

          <div className="flex items-center gap-3">
            <button className="btn-primary !py-2" onClick={save} disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </button>
            {!isSelf && (
              <button className="text-xs text-rose-500 hover:text-rose-700 font-semibold ml-auto" onClick={remove} disabled={pending}>
                このスタッフを削除
              </button>
            )}
            {msg && <span className="text-sm text-emerald-600 font-semibold">{msg}</span>}
            {error && <span className="text-sm text-rose-600 font-semibold">{error}</span>}
            {isSelf && role !== "owner" && (
              <span className="text-[11px] text-amber-600">※自分の役割を下げると管理画面に入れなくなる場合があります</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
