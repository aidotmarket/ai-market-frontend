import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_ALLAI_LOCALES,
  ANONYMOUS_ALLAI_RESOURCES,
  preferredAnonymousAllAILocale,
} from './anonymous-allai';

describe('anonymous allAI locale registry', () => {
  it('contains complete, distinct safe-state copy for every released locale', () => {
    const expectedOutcomes = [
      'no_matches',
      'retrieval_unavailable',
      'answer_unverified',
      'surface_disabled',
      'rate_limited',
      'unsupported_language',
    ];

    expect(ANONYMOUS_ALLAI_LOCALES).toEqual(['en', 'es', 'zh-Hans']);
    for (const locale of ANONYMOUS_ALLAI_LOCALES) {
      const resources = ANONYMOUS_ALLAI_RESOURCES[locale];
      expect(Object.keys(resources.safeOutcomes).sort()).toEqual(expectedOutcomes.sort());
      expect(new Set(Object.values(resources.safeOutcomes)).size).toBe(expectedOutcomes.length);
      expect(resources.assistantLabel.length).toBeGreaterThan(0);
      expect(resources.emptyPrompt.length).toBeGreaterThan(0);
      expect(resources.inputPlaceholder.length).toBeGreaterThan(0);
      expect(resources.accountRequired.length).toBeGreaterThan(0);
    }
  });

  it('maps browser language preferences only to supported locales', () => {
    expect(preferredAnonymousAllAILocale('es-MX')).toBe('es');
    expect(preferredAnonymousAllAILocale('zh-CN')).toBe('zh-Hans');
    expect(preferredAnonymousAllAILocale('fr-FR')).toBe('en');
  });
});
