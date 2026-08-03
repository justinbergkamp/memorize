import { describe, expect, it } from 'vitest';
import { deriveSceneScoring } from './contamination';

describe('deriveSceneScoring (§7.4 contamination)', () => {
  it('blank at position 0 is a scene failure: unscored, unretrieved', () => {
    const result = deriveSceneScoring('blank');
    expect(result.retrieved).toBe(false);
    expect(result.scored).toEqual([false, false, false]);
  });

  it('wrong_card at position 0 is a decode failure: scene retrieved, all scored', () => {
    const result = deriveSceneScoring('wrong_card');
    expect(result.retrieved).toBe(true);
    expect(result.scored).toEqual([true, true, true]);
  });

  it('correct at position 0 is normal: all scored', () => {
    const result = deriveSceneScoring('correct');
    expect(result.retrieved).toBe(true);
    expect(result.scored).toEqual([true, true, true]);
  });
});
