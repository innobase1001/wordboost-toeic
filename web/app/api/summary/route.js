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

export async function POST(req) {
  const body = await req.json();
  const client = getClient();

  const total = body.total ?? 0;
  const correctCount = body.correctCount ?? 0;
  const results = body.results || [];

  // オフラインコーチの総括（APIキーが無い場合はこれをそのまま返す）
  const offline = localSummary({
    total,
    correctCount,
    results,
    learnedTotal: body.learnedTotal ?? 0,
    weakness: body.weakness,
  });

  if (!client) {
    return Response.json(offline);
  }

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 700,
      system: [
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
      output_config: { format: zodOutputFormat(SummarySchema, 'summary') },
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
