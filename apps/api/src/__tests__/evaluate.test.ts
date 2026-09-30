import { describe, expect, it } from 'vitest';
import { evaluate } from '../agents/evaluate';

describe('agent evaluation', () => {
  it('calculates pass/fail per case', () => {
    const result = evaluate(
      [
        { id: '1', input: 'billing issue', expectedIntent: 'billing' },
        { id: '2', input: 'login issue', expectedIntent: 'auth' }
      ],
      (input) => input.includes('billing') ? 'billing' : 'wrong'
    );

    expect(result).toEqual([
      { id: '1', predictedIntent: 'billing', passed: true },
      { id: '2', predictedIntent: 'wrong', passed: false }
    ]);
  });
});

