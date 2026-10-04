import { describe, expect, it } from 'vitest';
import { FocusRestoreGuard } from './focusRestore';

describe('deferred focus restoration', () => {
  it('does not steal focus after a newer user focus change', () => {
    const guard = new FocusRestoreGuard();
    const ticket = guard.capture(4);

    guard.noteFocusChange();

    expect(guard.isCurrent(ticket, 4)).toBe(false);
  });

  it('rejects restoration from an older render', () => {
    const guard = new FocusRestoreGuard();
    const ticket = guard.capture(4);

    expect(guard.isCurrent(ticket, 5)).toBe(false);
    expect(guard.isCurrent(ticket, 4)).toBe(true);
  });
});
