"use client";

// 左上ブランドロゴ。画像が無い/読み込み失敗時は非表示にして
// 隣のブランド名テキストにフォールバックする（サーバーコンポーネントでは
// onError が使えないためクライアント側に切り出し）。
export default function BrandLogo({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-10 w-auto max-w-[200px] object-contain shrink-0"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
