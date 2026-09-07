const AI_BOT_SUBSTRINGS = [
  'gptbot',
  'oai-searchbot',
  'chatgpt-user',
  'claudebot',
  'claude-web',
  'anthropic-ai',
  'perplexitybot',
  'perplexity-user',
  'google-extended',
  'cohere-ai',
  'meta-externalagent',
];

export function detectAiBot(userAgent: string | null): boolean {
  const normalized = userAgent?.toLowerCase() ?? '';
  return AI_BOT_SUBSTRINGS.some((bot) => normalized.includes(bot));
}
