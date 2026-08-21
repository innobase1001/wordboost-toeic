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

// 最低限のフィードバック（リクエスト本体が壊れていた場合の最終防衛線）
const EMERGENCY = {
  reason: '',
  error_type: null,
  example_en: '',
  example_ja: '',
  tip: '',
  ai: false,
};

export async function POST(req) {
  // ここで失敗するとアプリ側は解説なしになるため、JSONの解析ごと保護する
  let body;
  let offline;
  try {
    body = await req.json();
    offline = localFeedback(body);
  } catch (err) {
    console.error('feedback: bad request', err?.message || err);
    return Response.json(EMERGENCY);
  }

  const client = getClient();
  if (!client) {
    return Response.json(offline);
  }

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 600,
      system: [
        // プロンプトキャッシュの指定。既定の claude-haiku-4-5 は最小キャッシュ長が
        // 4096トークンあり、このシステムプロンプト（約1000トークン）では実際には
        // キャッシュされない。ANTHROPIC_MODEL を最小長の短いモデルに変えたときに効く。
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
      output_config: { format: zodOutputFormat(FeedbackSchema) },
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
