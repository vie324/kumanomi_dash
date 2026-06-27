import Link from "next/link";

// 404 ページ。
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-card p-7 max-w-sm w-full text-center animate-scale-in">
        <div className="text-4xl mb-2">🔍</div>
        <h1 className="text-lg font-extrabold text-slate-900">ページが見つかりません</h1>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          お探しのページは存在しないか、移動した可能性があります。
        </p>
        <Link href="/" className="btn-primary mt-5 inline-flex">
          ホームへ戻る
        </Link>
      </div>
    </div>
  );
}
