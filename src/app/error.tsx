"use client";

import { useEffect } from "react";

// ルートセグメントのエラーバウンダリ。描画時の例外で白画面になるのを防ぐ。
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 開発時の確認用（本番では監視ツールへ送る想定）
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-card p-7 max-w-sm w-full text-center animate-scale-in">
        <div className="text-4xl mb-2">⚠️</div>
        <h1 className="text-lg font-extrabold text-slate-900">エラーが発生しました</h1>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          画面の表示中に問題が発生しました。お手数ですが、もう一度お試しください。
        </p>
        <div className="flex gap-2 justify-center mt-5">
          <button className="btn-primary" onClick={() => reset()}>
            再読み込み
          </button>
          <a className="btn-ghost" href="/">
            ホームへ
          </a>
        </div>
      </div>
    </div>
  );
}
