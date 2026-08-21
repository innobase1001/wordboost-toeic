import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getClient, MODEL } from '@/lib/claude';
import { FEEDBACK_SYSTEM, buildFeedbackUser } from '@/lib/prompts';
import { localFeedback } from '@/lib/coach';
import { ERROR_TYPE_KEYS } from '@/lib/errorTypes';

export const runtime = 'nodejs';

// 構造化出力スキーマ（Claudeの返答をこの形に固定する）
const FeedbackSchema = z.object({
  error_type: z.string(),
  reason: z.string(),
  example_en: z.string(),
  example_ja: z.string(),
  tip: z.string(),
});

const VALID_TYPES = ERROR_TYPE_KEYS;

export async function POST(req) {
  const body = await req.json();
  const client = getClient();

  // オフラインコーチの結果（APIキーが無い場合はこれをそのまま返す）
  const offline = localFeedback(body);

  if (!client) {
    return Response.json(offline);
  }

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 600,
      system: [
        { type: 'text', text: FEEDBACK_SYSTEM, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: buildFeedbackUser({
            word: body.word,
            pos: body.pos,
            meaning: body.meaning,
            level: body.level,
            exampleScene: body.exampleScene,
            similar: body.similar,
            chosenMeaning: body.chosenMeaning,
            chosenWord: body.chosenWord,
            chosenPos: body.chosenPos,
            correct: body.correct,
            isReview: body.isReview,
            weaknessLabel: body.weaknessLabel,
          }),
        },
      ],
      output_config: { format: zodOutputFormat(FeedbackSchema, 'feedback') },
    });

    const parsed = response.parsed_output;
    if (!parsed) return Response.json(offline);

    // 誤答タイプは集計キーになるため、想定外の値ならローカル判定にフォールバック
    const errorType = body.correct
      ? null
      : VALID_TYPES.includes(parsed.error_type)
        ? parsed.error_type
        : offline.error_type;

    return Response.json({
      reason: parsed.reason || offline.reason,
      error_type: errorType,
      example_en: parsed.example_en || offline.example_en,
      example_ja: parsed.example_ja || offline.example_ja,
      tip: parsed.tip || offline.tip,
      ai: true,
    });
  } catch (err) {
    console.error('feedback error:', err?.message || err);
    return Response.json(offline);
  }
}
