import Anthropic from "@anthropic-ai/sdk";
import { CHANNELS, type ContractMemo, type DailyReport, type Store } from "./types";

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export type FeedbackResult = {
  summary: string;
  issues: string;
  advice: string;
  encouragement: string;
};

const SYSTEM_PROMPT = `あなたは整体院グループ「くまのみ整体院」の店舗運営をサポートする、経験豊富なマネージャー兼コーチです。
スタッフが入力した日報・契約メモをもとに、その日の成績を振り返り、建設的なフィードバックを日本語で返します。

重視する観点:
- 売上・新規・契約が目標に届いているか。届いていない場合は「なぜ」を具体的に掘り下げる。
- 契約が取れたお客様の成功要因、取れなかったお客様の原因を、メモから読み取って言語化する。
- 精神論ではなく、明日から実行できる具体的な行動に落とし込む。
- スタッフが前向きに振り返れるよう、良かった点も必ず認める。

出力は必ず次のJSON形式のみ（前後に説明文やマークダウンの\`\`\`は付けない）:
{
  "summary": "その日の総評（2〜3文）",
  "issues": "目標未達の原因・課題の分析（箇条書き可、具体的に）",
  "advice": "明日からの改善アクション（箇条書き、3〜5個、実行可能な粒度で）",
  "encouragement": "前向きな振り返りの言葉（1〜2文）"
}`;

function sum(...ns: number[]) {
  return ns.reduce((a, b) => a + (b || 0), 0);
}

export function buildUserPrompt(
  report: DailyReport,
  memos: ContractMemo[],
  store: Store | null,
  memberName: string
): string {
  const totalNew = sum(report.hpb_new, report.meta_new, report.referral_new, report.discount_new);
  const totalContract = sum(
    report.hpb_contract,
    report.meta_contract,
    report.referral_contract,
    report.discount_contract
  );

  const channelLines = CHANNELS.map((c) => {
    const n = (report as unknown as Record<string, number>)[`${c.key}_new`] || 0;
    const ct = (report as unknown as Record<string, number>)[`${c.key}_contract`] || 0;
    return `  - ${c.label}: 新規 ${n} / 契約 ${ct}`;
  }).join("\n");

  const won = memos.filter((m) => m.outcome === "won");
  const lost = memos.filter((m) => m.outcome === "lost");

  const memoBlock = (label: string, list: ContractMemo[]) =>
    list.length === 0
      ? `  （記録なし）`
      : list
          .map(
            (m, i) =>
              `  ${i + 1}. ${m.customer_name || "お客様"}（${m.customer_attr || "属性不明"} / チャネル:${
                m.channel || "不明"
              }）\n     理由: ${m.reason || "未記入"}\n     次回: ${m.next_action || "未記入"}`
          )
          .join("\n");

  const target = store
    ? `店舗の目安: 月間売上目標 ${store.monthly_target_revenue.toLocaleString()}円 / 1日 新規目標 ${store.daily_target_new}人 / 1日 契約目標 ${store.daily_target_contract}人`
    : "";

  return `【日報】${report.report_date}  担当: ${memberName}（${store?.name || report.store_id}）

■ 売上
  本日売上: ${Number(report.revenue).toLocaleString()}円
  本日目標: ${Number(report.target_revenue || 0).toLocaleString()}円
${target}

■ 新規 / 契約（合計 新規 ${totalNew} / 契約 ${totalContract}）
${channelLines}
  既存(リピート)施術: ${report.existing_treatments}件

■ 業務チェック
  当日業務完了: ${report.daily_tasks_completed ? "はい" : "いいえ"}
  翌日準備完了: ${report.tomorrow_prep_completed ? "はい" : "いいえ"}

■ 本人の所感
  ${report.note || "（未記入）"}

■ 契約が取れたお客様（${won.length}件）
${memoBlock("won", won)}

■ 契約が取れなかったお客様（${lost.length}件）
${memoBlock("lost", lost)}

以上の日報について、システムプロンプトのJSON形式でフィードバックしてください。`;
}

export async function generateFeedback(args: {
  report: DailyReport;
  memos: ContractMemo[];
  store: Store | null;
  memberName: string;
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
        content: buildUserPrompt(args.report, args.memos, args.store, args.memberName),
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

// モデル出力からJSONを安全に取り出す
export function parseFeedback(text: string): FeedbackResult {
  let jsonText = text;
  // ```json ... ``` で囲まれていた場合に剥がす
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonText = fence[1];
  // 最初の { から最後の } までを抽出
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
    // パース失敗時は本文をそのまま総評に入れてフォールバック
    return {
      summary: text.slice(0, 800),
      issues: "",
      advice: "",
      encouragement: "",
    };
  }
}
