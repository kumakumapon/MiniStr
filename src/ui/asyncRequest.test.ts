import { describe, expect, it } from 'vitest';
import { AsyncRequestGate } from './asyncRequest';

describe('latest asynchronous request wins', () => {
  it('invalidates an earlier read when a newer one starts or the screen changes', () => {
    const gate = new AsyncRequestGate();
    const first = gate.begin();
    const second = gate.begin();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    gate.invalidate();
    expect(gate.isCurrent(second)).toBe(false);
  });
});
