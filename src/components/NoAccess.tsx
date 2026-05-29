export default function NoAccess() {
  return (
    <main className="min-h-screen grid place-items-center px-4 bg-slate-50">
      <div className="glass-card p-7 max-w-sm text-center">
        <h1 className="text-lg font-extrabold text-slate-900 mb-2">アクセス権がありません</h1>
        <p className="text-sm text-slate-500 mb-5">
          ログインは成功しましたが、このアカウントに紐づくメンバー情報が見つかりませんでした。
          管理者にお問い合わせください。
        </p>
        <form action="/auth/signout" method="post">
          <button className="btn-ghost w-full">ログアウト</button>
        </form>
      </div>
    </main>
  );
}
