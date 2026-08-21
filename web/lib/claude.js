import Anthropic from '@anthropic-ai/sdk';

// コスト重視で高速・安価な Haiku 4.5 を既定に（環境変数で変更可）
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

// APIキーが無ければ null を返し、呼び出し側でフォールバックさせる
export function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}
