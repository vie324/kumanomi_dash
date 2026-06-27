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

  return `【日報】${report.report_date}  担当: ${memberName}（${store?.name || report.store_id}）

■ 売上
  本日売上: ${Number(report.revenue).toLocaleString()}円
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
    max_tokens: 1500,
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

export function parseFeedback(text: string): FeedbackResult {
  let jsonText = text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonText = fence[1];
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start !== -1 && end !== -1) jsonText = jsonText.slice(start, end + 1);

  try {
    const obj = JSON.parse(jsonText);
    return {
      summary: String(obj.summary || ""),
      issues: String(obj.issues || ""),
      advice: String(obj.advice || ""),
      encouragement: String(obj.encouragement || ""),
    };
  } catch {
    return { summary: text.slice(0, 800), issues: "", advice: "", encouragement: "" };
  }
}
