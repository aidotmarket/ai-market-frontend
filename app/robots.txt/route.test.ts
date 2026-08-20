import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('robots.txt anonymous allAI discovery', () => {
  it('links the canonical public manifest', async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(body).toContain(
      '# anonymous allAI: https://api.ai.market/api/v1/public/allai/anonymous/manifest.json'
    );
  });
});
