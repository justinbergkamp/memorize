import { describe, expect, it } from 'vitest';
import { deriveSceneScoring } from './contamination';

describe('deriveSceneScoring', () => {
  it('blank at position 0 is a single miss: scene unretrieved, but all three cards stay scored', () => {
    const result = deriveSceneScoring('blank');
    expect(result.retrieved).toBe(false);
    expect(result.scored).toEqual([true, true, true]);
  });

  it('wrong_card at position 0: scene retrieved, all scored', () => {
    const result = deriveSceneScoring('wrong_card');
    expect(result.retrieved).toBe(true);
    expect(result.scored).toEqual([true, true, true]);
  });

  it('correct at position 0: all scored', () => {
    const result = deriveSceneScoring('correct');
    expect(result.retrieved).toBe(true);
    expect(result.scored).toEqual([true, true, true]);
  });
});
