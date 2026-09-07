import { describe, expect, it } from 'vitest';
import { detectAiBot } from './aiBot';

describe('detectAiBot', () => {
  it.each([
    'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web',
    'Anthropic-AI', 'PerplexityBot', 'Perplexity-User', 'Google-Extended',
    'Cohere-AI', 'Meta-ExternalAgent',
  ])('detects %s case-insensitively within a user agent', (bot) => {
    expect(detectAiBot(`Mozilla/5.0 (compatible; ${bot}/1.0)`)).toBe(true);
    expect(detectAiBot(bot.toUpperCase())).toBe(true);
    expect(detectAiBot(bot.toLowerCase())).toBe(true);
  });

  it.each([null, '', 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36', 'Googlebot', 'bingbot'])
    ('ignores non-AI user agent %s', (userAgent) => {
      expect(detectAiBot(userAgent)).toBe(false);
    });
});
