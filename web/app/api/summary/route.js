import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getClient, MODEL } from '@/lib/claude';
import { SUMMARY_SYSTEM, buildSummaryUser } from '@/lib/prompts';
import { localSummary } from '@/lib/coach';

export const runtime = 'nodejs';

const SummarySchema = z.object({
  headline: z.string(),
  good: z.string(),
  advice: z.string(),
  focus: z.string(),
});

// 最低限の総括（リクエスト本体が壊れていた場合の最終防衛線）
const EMERGENCY = {
  headline: '今日もおつかれさまでした 🌱',
  good: '学習セッションを最後まで完了できました。',
  advice: '間違えた単語は復習キューに入ります。次回もう一度会いにいきましょう。',
  focus: '直近で間違えた単語から復習しましょう。',
  ai: false,
};

export async function POST(req) {
  let body;
  let total;
  let correctCount;
  let results;
  let offline;
  try {
    body = await req.json();
    total = body.total ?? 0;
    correctCount = body.correctCount ?? 0;
    results = Array.isArray(body.results) ? body.results : [];
    offline = localSummary({
      total,
      correctCount,
      results,
      learnedTotal: body.learnedTotal ?? 0,
      weakness: body.weakness,
    });
  } catch (err) {
    console.error('summary: bad request', err?.message || err);
    return Response.json(EMERGENCY);
  }

  const client = getClient();
  if (!client) {
    return Response.json(offline);
  }

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 700,
      system: [
        // プロンプトキャッシュの指定。既定の claude-haiku-4-5 は最小キャッシュ長が
        // 4096トークンあり、このシステムプロンプト（約1000トークン）では実際には
        // キャッシュされない。ANTHROPIC_MODEL を最小長の短いモデルに変えたときに効く。
        { type: 'text', text: SUMMARY_SYSTEM, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: buildSummaryUser({
            total,
            correctCount,
            results,
            learnedTotal: body.learnedTotal ?? 0,
            overallAccuracy: body.overallAccuracy ?? 0,
            readiness: body.readiness ?? 0,
            weakness: body.weakness,
          }),
        },
      ],
      output_config: { format: zodOutputFormat(SummarySchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) return Response.json(offline);

    return Response.json({
      headline: parsed.headline || offline.headline,
      good: parsed.good || offline.good,
      advice: parsed.advice || offline.advice,
      focus: parsed.focus || offline.focus,
      ai: true,
    });
  } catch (err) {
    console.error('summary error:', err?.message || err);
    return Response.json(offline);
  }
}
