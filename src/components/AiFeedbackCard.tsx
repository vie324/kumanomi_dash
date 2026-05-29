export type FeedbackData = {
  summary?: string | null;
  issues?: string | null;
  advice?: string | null;
  encouragement?: string | null;
  model?: string | null;
};

function Block({ title, body, accent }: { title: string; body?: string | null; accent: string }) {
  if (!body) return null;
  return (
    <div>
      <p className={`text-xs font-bold mb-1 ${accent}`}>{title}</p>
      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{body}</p>
    </div>
  );
}

export default function AiFeedbackCard({
  feedback,
  loading,
}: {
  feedback: FeedbackData | null;
  loading?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-sise-200 bg-gradient-to-br from-sise-50 to-white p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-grid place-items-center w-7 h-7 rounded-lg bg-sise-500 text-white text-sm font-bold">AI</span>
        <h2 className="text-sm font-extrabold text-slate-900">AIフィードバック</h2>
        {feedback?.model && <span className="text-[10px] text-slate-400 ml-auto">{feedback.model}</span>}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">日報を分析しています…（数秒〜十数秒）</p>
      ) : feedback ? (
        <div className="space-y-3">
          <Block title="総評" body={feedback.summary} accent="text-slate-600" />
          <Block title="課題・未達の原因" body={feedback.issues} accent="text-rose-600" />
          <Block title="明日からの改善アクション" body={feedback.advice} accent="text-sise-600" />
          <Block title="振り返り" body={feedback.encouragement} accent="text-emerald-600" />
        </div>
      ) : null}
    </section>
  );
}
