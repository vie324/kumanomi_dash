"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("ログインに失敗しました。メールアドレスとパスワードをご確認ください。");
      setLoading(false);
      return;
    }
    const redirect = params.get("redirect") || "/";
    router.replace(redirect);
    router.refresh();
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-gradient-to-br from-orange-50 via-white to-amber-50">
      {/* 背景の柔らかなグラデブロブ */}
      <div className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full bg-orange-200/40 blur-3xl animate-float" />
      <div className="pointer-events-none absolute -bottom-28 -left-24 w-96 h-96 rounded-full bg-amber-200/30 blur-3xl" />
      <div className="relative w-full max-w-sm glass-card p-7 animate-scale-in shadow-[0_20px_60px_-24px_rgba(15,23,42,0.35)]">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-white text-2xl font-extrabold mb-3 shadow-[0_10px_24px_-8px_rgba(234,88,12,0.5)] animate-float">
            く
          </div>
          <h1 className="text-lg font-extrabold text-slate-900">くまのみグループ</h1>
          <p className="text-xs text-slate-500 mt-1">経営ダッシュボード（整体 / エステ）</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="field-label">メールアドレス</label>
            <input
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="field-label">パスワード</label>
            <input
              type="password"
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "ログイン中…" : "ログイン"}
          </button>
        </form>
      </div>
    </main>
  );
}
