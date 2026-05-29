# 旧ダッシュボード コードレビュー（`legacy/index.html`）

対象: `legacy/index.html`（旧 `index.html` をリネーム / 約15,450行）。行番号は旧ファイルと一致します。

ご依頼の「エラーがないか全体的な見直し」の結果です。**この旧ファイルは段階的に Next.js 版へ置き換える前提**のため、ここでは修正は行わず、検出した不具合と推奨対応を一覧化しています。優先度の高い順に対応してください。

> 新 Next.js 版（`src/`）では、ここで指摘した集計・null安全・状態ミューテーション・秘匿情報の直書きなどの問題は作り込まないように実装しています。

---

## CRITICAL

### 1. Hooks のルール違反（早期 return がフックより前）— `DashboardView` 7637–7640
`if (!window.Recharts) return <div>...</div>;` が `useMemo`(7640) などのフックより**前**にあります。Recharts は CDN から非同期ロードされるため、`window.Recharts` が偽→真に変わるとレンダー間でフック数が変化し、React が致命的エラー（"Rendered fewer hooks than expected"）を投げてアプリ全体がクラッシュし得ます。
- **対応**: `useState`/`useMemo` をガードより上に移動するか、ローディング分岐を JSX 内で出す（`return ... {!window.Recharts ? <Loading/> : <Charts/>}`）。

---

## HIGH

### 2. `.sort()` による state 配列の破壊的変更 — `DailyReportListView` 8088–8101
`allowedStoreNames` が null かつ `filterStore === 'all'` のとき `reports` が `reportData.reports` と同一参照になり、`reports.sort(...)` が state を直接ミューテートします。再レンダーの不整合・ソート順バグの原因。
- **対応**: `return [...reports].sort(...)`。

### 3. 常に真になる `find` 述語（サブスク phase 選択が機能しない）— 3336
`sub.phases.find(p => !p.uid || p) || sub.phases[0]` は任意のオブジェクト `p` で常に真になり、意図に関わらず常に `phases[0]` を返します。会員の月額表示が誤る恐れ。
- **対応**: 例 `sub.phases.find(p => p.uid) || sub.phases[0]`、または正の価格を持つ phase を選ぶ。

### 4. 本番 GAS エンドポイントの直書き（秘匿情報の漏えい）— 2142
ライブの Apps Script デプロイURLがクライアントソースに埋め込まれ、全ブラウザに配布されています。誰でも POST 可能（スタッフ保存・出納帳保存などが事実上無認証）。
- **対応**: プロキシ経由に変更、または GAS 側でサーバー認証を必須化し、デプロイURLをローテーション。**移行完了後は必ず失効。**

---

## MEDIUM

### 5. パスワードの平文比較 — 2713–2714 (`verifyStaffPassword`)
`if (staff.password === password)` … パスワードを平文で保存・比較し、クライアントにも取得しています。
- **対応**: サーバー側でハッシュ化。パスワード情報をクライアントへ返さない。（新版では Supabase Auth に集約）

### 6. 割合計算が 100% を超える / 負の幅 — 9460, 9453
`activeMembers / 200 * 100` の目標%が 100% を超え得る。`width: ${100 - churnRate}%` は `churnRate > 100` で負値に。
- **対応**: `Math.max(0, Math.min(100, ...))` でクランプ。

### 7. `churnRate` が 100% を超え得る（コホート不一致）— 3414–3416
`canceledThisMonth.length / activeSubscriptions.length * 100`。分子は CANCELED、分母は ACTIVE で互いに素な集合のため、真の解約率にならず 100% 超もあり得る（#6 の負幅バグも誘発）。
- **対応**: 月初時点のアクティブ数（active + canceledThisMonth）で割り、クランプ。

### 8. null 可能性のあるフィールドへの `.toLowerCase()` / `.includes()` — 9290–9292, 10501
`m.name.toLowerCase()`, `m.email.toLowerCase()`, `m.phone.includes(query)` 等。手動/GAS由来のメンバーで null の可能性。検索時に例外。
- **対応**: `(m.name || '').toLowerCase()` などでガード。

### 9. `fetch().json()` を `.ok` 未確認で呼ぶ（Meta）— 11623–11644
500 が HTML を返すとパース例外（try/catch内で握り潰され、実 HTTP ステータスが見えない）。Square/TikTok 側は `.ok` を確認していて不整合。
- **対応**: `res.ok` を確認しステータスを表面化。

### 10. `useLineChat.fetchConfig` の stale closure / 依存欠落 — 2517–2531
init `useEffect` の deps が `[]` のため初回 `storeId` を捕捉。店舗自動選択が初期値に固定。
- **対応**: deps に追加するか ref 経由で `storeId` を読む。

### 11. 動的リストに index ベースの `key` — 8795, 9611, 4974, 5838
並び替え/挿入削除で reconciliation が誤対応する恐れ。
- **対応**: 安定 id（`report.id`, `inv.id` 等）を使用。

---

## LOW

### 12. `analyzeSide` のデッド/誤計算 — 6126–6128
`shAngle` 未使用。`rollAngle` のコメント（鎖骨-肩-腰）と実計算（肩-耳-腰）が不一致＝「巻き肩」指標が誤ったランドマークから算出。
- **対応**: `shAngle` 削除、`rollAngle` を意図したランドマークで再計算。

### 13. SVG文字列へ未エスケープの `color` 補間（`Icon`）— 2775（2785 で `dangerouslySetInnerHTML`）
現状の呼び出しはリテラルのみで実害なし。将来 `color` がユーザー/サーバー由来になると注入リスク。
- **対応**: color をホワイトリスト検証、または DOM 生成に。

### 14. `MiniSparkline` の cx が無意味な式 — 2944
`((data.length-1)/(data.length-1)) * width` は常に `width`。
- **対応**: `cx={width}`。

### 15. `getCurrentBillingPeriod` がローカル Date に `toISOString()` — 3672
ローカル深夜を UTC 変換して `periodKey` が前日へずれる恐れ（JSTで off-by-one）。他箇所はローカル `todayLocalYMD` を使用していて不整合。
- **対応**: ローカルの getFullYear/getMonth/getDate で整形。

### 16. `new Date(report.timestamp)` を妥当性チェックなしで描画 — 8176, 7709
不正な timestamp で "Invalid Date" 表示や "Invalid Date" バケット化。
- **対応**: `isNaN(d)` でガードし '-' にフォールバック。

### 17. 複合 key の衝突 — 8174
`key={report.timestamp + '_' + report.store}` は同店舗・同時刻で衝突。
- **対応**: `report.id` があれば優先。

---

## 確認済み（問題なし）
- GASヘルパ各種（`resolveStoreId`, `hapticSuccess/Error`, `todayLocalYMD` 等）は定義済み。`generateMonthlyTrendFromData`(3536) は実行時呼び出しのみで遅延定義でも安全。
- パスワードゲート（`AppWithAuth` 14848–14859）はフック前にガードを評価しておりフック順問題なし。
- `QuickSearchModal` の props は呼び出しとシグネチャが一致。
- `useSquareData` の `Promise.allSettled` ファンアウトはリジェクトを処理。
- 多くの `JSON.parse(localStorage...)` は try/catch 済み。

---

### 最優先の対応順
**#1**（アプリクラッシュ） → **#3 / #7**（会員月額・解約率の誤表示） → **#2**（state ミューテーション） → **#4**（GAS URL 漏えい）
