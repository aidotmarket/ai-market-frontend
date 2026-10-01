import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { TERMS_1_2_BOX_1, TERMS_1_2_BOX_3 } from './terms12Copy';

it('uses verbatim passages from the merged, approved 1.2 document', () => {
  const approved = readFileSync('app/legal/terms/terms_v1_2.test.md', 'utf8');
  for (const passage of [TERMS_1_2_BOX_1, TERMS_1_2_BOX_3]) {
    expect(approved).toContain(passage);
  }
  expect(approved).not.toContain('Legal must review');
});
