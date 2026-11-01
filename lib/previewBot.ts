const PREVIEW_BOTS = ['twitterbot', 'linkedinbot', 'facebookexternalhit', 'slackbot', 'telegrambot', 'whatsapp', 'discordbot', 'redditbot', 'bluesky', 'cardyb', 'googlebot', 'bingbot', 'applebot'];

export function detectPreviewBot(userAgent: string | null): boolean {
  const ua = userAgent?.toLowerCase() ?? '';
  return PREVIEW_BOTS.some(bot => ua.includes(bot));
}
