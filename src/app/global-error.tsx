"use client";

// ルートレイアウト自体で例外が出た場合の最終フォールバック。
// layout を置き換えるため <html>/<body> を自前で描画し、CSS未適用でも崩れないよう
// インラインスタイルで最低限の見た目を確保する。
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f6f4",
          fontFamily: "system-ui, sans-serif",
          color: "#0f172a",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 28,
            maxWidth: 360,
            width: "90%",
            textAlign: "center",
            boxShadow: "0 18px 40px -16px rgba(15,23,42,0.25)",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>エラーが発生しました</h1>
          <p style={{ fontSize: 14, color: "#64748b", marginTop: 6, lineHeight: 1.6 }}>
            予期しない問題が発生しました。もう一度お試しください。
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 18,
              padding: "10px 18px",
              borderRadius: 12,
              border: "none",
              background: "#ea580c",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            再読み込み
          </button>
        </div>
      </body>
    </html>
  );
}
