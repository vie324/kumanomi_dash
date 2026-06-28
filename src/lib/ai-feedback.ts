import Anthropic from "@anthropic-ai/sdk";
import { contractLabel, type ContractMemo, type DailyReport, type Store } from "./types";

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export type FeedbackResult = {
  summary: string;
  issues: string;
  advice: string;
  encouragement: string;
};

// 比較コーチング用の「今月のペース」コンテキスト
export type CoachingContext = {
  monthLabel: string; // 例: "2026年6月"
  daysElapsed: number;
  daysInMonth: number;
  mtdRevenue: number; // 今月の累計売上（当日まで）
  monthTarget: number; // 月間売上目標（0=未設定）
  projectedRevenue: number; // 月末着地予測
  mtdNew: number; // 今月の累計 新規
  mtdContract: number; // 今月の累計 契約
};

const SYSTEM_PROMPT = `あなたは整体院グループ「くまのみ整体院」の店舗運営をサポートする、経験豊富なマネージャー兼コーチです。
スタッフが入力した日報・新規のお客様ごとの契約記録をもとに、その日の成績を振り返り、建設的なフィードバックを日本語で返します。

重視する観点:
- 売上・新規数・契約数が目標に届いているか。届いていない場合は「なぜ」を具体的に掘り下げる。
- 既存のお客様の「次回予約率」、新規のお客様の「2回目予約への転換率」を、定着・リピートの観点で評価する。
- 新規のお客様について、契約が取れた成功要因と、取れなかった原因を、記録された理由から読み取って言語化する。
- 契約内容（回数券か定額か、プランの大きさ）の傾向にも触れ、より良い提案ができたか考える。
- 精神論ではなく、明日から実行できる具体的な行動に落とし込む（本人が書いた「明日の行動」も踏まえて補強・修正する）。
- 「今月のペース（月末着地予測）」が与えられた場合は、月間目標に対して今どの位置にいるかを比較し、残り日数で何をすべきかを具体的に示す。
- スタッフが前向きに振り返れるよう、良かった点も必ず認める。

出力は必ず次のJSON形式のみ（前後に説明文やマークダウンの\`\`\`は付けない）:
{
  "summary": "その日の総評（2〜3文）",
  "issues": "目標未達の原因・課題の分析（箇条書き可、具体的に）",
  "advice": "明日からの改善アクション（箇条書き、3〜5個、実行可能な粒度で）",
  "encouragement": "前向きな振り返りの言葉（1〜2文）"
}`;

export function buildUserPrompt(
  report: DailyReport,
  memos: ContractMemo[],
  store: Store | null,
  memberName: string,
  context?: CoachingContext
): string {
  const won = memos.filter((m) => m.outcome === "won");
  const lost = memos.filter((m) => m.outcome === "lost");

  const resvRate =
    report.existing_treatments > 0
      ? Math.round((report.next_reservations / report.existing_treatments) * 100)
      : 0;
  const secondRate =
    report.new_count > 0
      ? Math.round((report.second_visit_reservations / report.new_count) * 100)
      : 0;

  const wonBlock =
    won.length === 0
      ? "  （なし）"
      : won
          .map((m, i) => {
            const plan = m.menu_label || contractLabel(m);
            const ch = m.channel ? ` / 媒体: ${m.channel}` : "";
            return `  ${i + 1}. ${m.customer_name || "お客様"}（${m.customer_attr || "属性不明"}）${ch}${plan ? ` / 契約: ${plan}` : ""}\n     決め手: ${m.reason || "未記入"}`;
          })
          .join("\n");

  const lostBlock =
    lost.length === 0
      ? "  （なし）"
      : lost
          .map(
            (m, i) =>
              `  ${i + 1}. ${m.customer_name || "お客様"}（${m.customer_attr || "属性不明"}）${m.channel ? ` / 媒体: ${m.channel}` : ""}\n     取れなかった理由: ${m.reason || "未記入"}`
          )
          .join("\n");

  const target = store
    ? `店舗の目安: 月間売上目標 ${Number(store.monthly_target_revenue || 0).toLocaleString()}円 / 1日 新規目標 ${store.daily_target_new ?? 0}人 / 1日 契約目標 ${store.daily_target_contract ?? 0}人`
    : "";

  const paceBlock = context
    ? `\n■ 今月のペース（${context.monthLabel}・${context.daysElapsed}/${context.daysInMonth}日経過）
  今月の累計売上: ${context.mtdRevenue.toLocaleString()}円${
        context.monthTarget > 0 ? ` / 月間目標 ${context.monthTarget.toLocaleString()}円` : ""
      }
  月末着地予測: ${context.projectedRevenue.toLocaleString()}円${
        context.monthTarget > 0
          ? `（目標比 ${Math.round((context.projectedRevenue / context.monthTarget) * 100)}%）`
          : ""
      }
  今月の累計: 新規 ${context.mtdNew}人 / 契約 ${context.mtdContract}件\n`
    : "";

  const estheSales =
    Number(report.product_sales || 0) +
      Number(report.new_product_sales || 0) +
      Number(report.renewal_sales || 0) +
      Number(report.new_trial_amount || 0) +
      Number(report.other_amount || 0) >
    0
      ? `\n  内訳: 物販 ${Number(report.product_sales || 0).toLocaleString()}円 / 新規物販 ${Number(
          report.new_product_sales || 0
        ).toLocaleString()}円 / 継続売上 ${Number(report.renewal_sales || 0).toLocaleString()}円 / 新規体験 ${Number(
          report.new_trial_amount || 0
        ).toLocaleString()}円 / その他 ${Number(report.other_amount || 0).toLocaleString()}円\n  継続契約: ${
          report.renewal_contracts || 0
        }件`
      : "";

  return `【日報】${report.report_date}  担当: ${memberName}（${store?.name || report.store_id}）

■ 売上
  本日売上: ${Number(report.revenue).toLocaleString()}円${estheSales}
${target}

■ 既存（リピート）
  施術数（新患含めない）: ${report.existing_treatments}件
  次回予約数: ${report.next_reservations}件（次回予約率 ${resvRate}%）

■ 新規
  新規数: ${report.new_count}人
  2回目予約につながった数: ${report.second_visit_reservations}人（転換率 ${secondRate}%）
  契約: ${won.length}件 / 未契約: ${lost.length}件

■ 契約が取れた新規のお客様（${won.length}件）
${wonBlock}

■ 契約が取れなかった新規のお客様（${lost.length}件）
${lostBlock}
${paceBlock}
■ 今日の振り返り（本人記入）
  ${report.reflection || "（未記入）"}

■ 明日の行動（本人記入）
  ${report.tomorrow_action || "（未記入）"}

以上の日報について、システムプロンプトのJSON形式でフィードバックしてください。`;
}

export async function generateFeedback(args: {
  report: DailyReport;
  memos: ContractMemo[];
  store: Store | null;
  memberName: string;
  context?: CoachingContext;
}): Promise<{ result: FeedbackResult; model: string; raw: unknown }> {
  const anthropic = new Anthropic(); // ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL は環境変数から
  const model = DEFAULT_MODEL;

  const msg = await anthropic.messages.create({
    model,
    // 1500 では途中で切れて JSON が壊れ、生のJSON断片が総評に混入することがあった。
    // 余裕を持たせて最後まで生成させる。
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(args.report, args.memos, args.store, args.memberName, args.context),
      },
    ],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const result = parseFeedback(text);
  return { result, model, raw: msg };
}

// JSON 文字列から指定キーの文字列値を寛容に取り出す。
// 末尾が切れて閉じ引用符が無い（トークン上限で途中終了）場合でも、
// そこまでの本文をそのまま返す（生のJSON記号は混入させない）。
function extractJsonString(src: string, key: string): string {
  const keyIdx = src.indexOf(`"${key}"`);
  if (keyIdx === -1) return "";
  let i = src.indexOf(":", keyIdx);
  if (i === -1) return "";
  i++;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== '"') return "";
  i++;
  let out = "";
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      const n = src[i + 1];
      out += n === "n" ? "\n" : n === "t" ? "\t" : n ?? "";
      i += 2;
      continue;
    }
    if (c === '"') break; // 閉じ引用符
    out += c;
    i++;
  }
  return out.trim();
}

// JSON にできなかったテキストから装飾（コードフェンス・キー名）を除去し、
// 読める本文だけを残す（"```json"・'{ "summary": ' などを表に出さない）。
function stripJsonArtifacts(text: string): string {
  return text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .replace(/^\s*\{/, "")
    .replace(/\}\s*$/, "")
    .replace(/"(summary|issues|advice|encouragement)"\s*:\s*"?/gi, "")
    .replace(/"\s*,\s*$/g, "")
    .replace(/"\s*$/g, "")
    .trim();
}

// ============================================================
// 店舗責任者向け スタッフ指導コーチング（月次）
// ============================================================
export type CoachingResult = {
  strengths: string;
  issues: string;
  coaching: string;
};

export type CoachingStats = {
  monthLabel: string;
  reportCount: number;
  revenue: number;
  newCount: number;
  contract: number;
  contractRate: number; // %
  existingTreatments: number;
  nextReservations: number;
  reservationRate: number; // %
  secondVisit: number;
  secondVisitRate: number; // %
  productSales: number;
  renewalSales: number;
  newTrialAmount: number;
  // 目標（任意）
  newSalesTarget?: number;
  newSalesActual?: number;
  contractRateTarget?: number;
  productTarget?: number;
  productActual?: number;
  existingSalesTarget?: number;
  existingSalesActual?: number;
  // 定性材料
  wonReasons: string[];
  lostReasons: string[];
  reflections: string[];
};

const COACHING_SYSTEM_PROMPT = `あなたは整体・エステ店舗グループの人材育成を支援する、経験豊富なエリアマネージャーです。
店舗責任者（店長）が対象スタッフを指導・教育するための材料を、日本語でまとめます。
対象スタッフ本人ではなく「店舗責任者に向けた」コーチング資料である点に注意してください。

重視する観点:
- 1ヶ月の成績（売上・新規・契約率・次回予約率・2回目予約転換率・物販・継続）と目標達成状況を踏まえる。
- 契約が取れた理由／取れなかった理由、本人の振り返りから、行動の傾向・強み・課題を読み取る。
- 「店舗責任者が次の1on1や日々の声かけで何を伝え、どう関わるべきか」を具体的な指導アクションに落とす。
- 精神論ではなく、再現可能な行動・スクリプト・練習方法を提案する。

出力は必ず次のJSON形式のみ（前後に説明文やマークダウンの\`\`\`は付けない）:
{
  "strengths": "このスタッフの強み・伸ばすべき点（箇条書き可）",
  "issues": "課題・つまずいている点の分析（箇条書き可、具体的に）",
  "coaching": "店舗責任者への指導アドバイス（箇条書き、3〜6個、1on1や日々の声かけで使える粒度で）"
}`;

function pctLine(label: string, actual?: number, target?: number, unit = "円"): string {
  if (target == null || target <= 0) return "";
  const a = actual ?? 0;
  const r = Math.round((a / target) * 100);
  return `\n  ${label}: ${a.toLocaleString()}${unit} / 目標 ${target.toLocaleString()}${unit}（達成率 ${r}%）`;
}

export function buildCoachingPrompt(memberName: string, store: Store | null, s: CoachingStats): string {
  const list = (arr: string[], max = 8) =>
    arr.filter((x) => x && x.trim()).slice(0, max).map((x) => `  ・${x.trim()}`).join("\n") || "  （記録なし）";

  return `【対象スタッフ】${memberName}（${store?.name || ""}）  対象月: ${s.monthLabel}

■ 成績（月間合計・日報 ${s.reportCount}件）
  売上: ${s.revenue.toLocaleString()}円
  新規: ${s.newCount}人 / 契約: ${s.contract}件（新規→契約率 ${s.contractRate}%）
  既存施術: ${s.existingTreatments}件 / 次回予約: ${s.nextReservations}件（次回予約率 ${s.reservationRate}%）
  2回目予約: ${s.secondVisit}人（転換率 ${s.secondVisitRate}%）
  物販: ${s.productSales.toLocaleString()}円 / 継続売上: ${s.renewalSales.toLocaleString()}円 / 新規体験: ${s.newTrialAmount.toLocaleString()}円

■ 目標達成状況${pctLine("新規売上", s.newSalesActual, s.newSalesTarget)}${
    s.contractRateTarget && s.contractRateTarget > 0
      ? `\n  新規契約率: ${s.contractRate}% / 目標 ${s.contractRateTarget}%`
      : ""
  }${pctLine("物販", s.productActual, s.productTarget)}${pctLine("既存売上", s.existingSalesActual, s.existingSalesTarget)}

■ 契約できた理由（決め手）
${list(s.wonReasons)}

■ 契約に至らなかった理由
${list(s.lostReasons)}

■ 本人の振り返り（抜粋）
${list(s.reflections)}

以上をもとに、店舗責任者がこのスタッフを指導するための強み・課題・指導アドバイスを、システムプロンプトのJSON形式でまとめてください。`;
}

export async function generateStaffCoaching(args: {
  memberName: string;
  store: Store | null;
  stats: CoachingStats;
}): Promise<{ result: CoachingResult; model: string; raw: unknown }> {
  const anthropic = new Anthropic();
  const model = DEFAULT_MODEL;
  const msg = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    system: COACHING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildCoachingPrompt(args.memberName, args.store, args.stats) }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const f = parseFeedback(text); // 同じ寛容パーサで summary/issues/advice を流用
  const result: CoachingResult = {
    strengths: extractCoachingField(text, "strengths") || f.summary,
    issues: extractCoachingField(text, "issues") || f.issues,
    coaching: extractCoachingField(text, "coaching") || f.advice,
  };
  return { result, model, raw: msg };
}

// coaching 用キー抽出（parseFeedback と同じ寛容ロジックを公開キー向けに）
function extractCoachingField(text: string, key: string): string {
  let jsonText = text.trim();
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonText = fence[1].trim();
  const start = jsonText.indexOf("{");
  if (start !== -1) jsonText = jsonText.slice(start);
  try {
    const o = JSON.parse(jsonText.slice(0, jsonText.lastIndexOf("}") + 1));
    if (o && typeof o === "object" && o[key] != null) return String(o[key]);
  } catch {
    /* fall through to lenient */
  }
  return extractJsonString(jsonText, key);
}

export function parseFeedback(text: string): FeedbackResult {
  // コードフェンス・前後の説明文を除去し、最初の { 以降だけを対象にする。
  let jsonText = text.trim();
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonText = fence[1].trim();
  const start = jsonText.indexOf("{");
  if (start !== -1) jsonText = jsonText.slice(start);
  const end = jsonText.lastIndexOf("}");
  const balanced = end > 0 ? jsonText.slice(0, end + 1) : jsonText;

  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const o = JSON.parse(s);
      return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  // 1) 厳密パース（完全なJSONのとき）
  const obj = tryParse(balanced) ?? tryParse(jsonText);
  if (obj) {
    return {
      summary: String(obj.summary ?? ""),
      issues: String(obj.issues ?? ""),
      advice: String(obj.advice ?? ""),
      encouragement: String(obj.encouragement ?? ""),
    };
  }

  // 2) 途中で切れた等でパース不可 → キーごとに寛容抽出
  const lenient = {
    summary: extractJsonString(jsonText, "summary"),
    issues: extractJsonString(jsonText, "issues"),
    advice: extractJsonString(jsonText, "advice"),
    encouragement: extractJsonString(jsonText, "encouragement"),
  };
  if (lenient.summary || lenient.issues || lenient.advice || lenient.encouragement) {
    return lenient;
  }

  // 3) 最後の手段: JSON記号を取り除いた本文を総評として表示（生のJSONは出さない）
  return { summary: stripJsonArtifacts(text).slice(0, 1500), issues: "", advice: "", encouragement: "" };
}
