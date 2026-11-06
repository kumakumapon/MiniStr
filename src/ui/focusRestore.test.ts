import { describe, expect, it, vi } from 'vitest';
import { focusIfChanged, FocusRestoreGuard } from './focusRestore';

it('avoids redundant native focus on a retained active tile', () => {
  document.body.innerHTML = '<button class="tile">tile</button><button id="next">next</button>';
  const tile = document.querySelector<HTMLButtonElement>('.tile')!;
  tile.focus();
  const focus = vi.spyOn(tile, 'focus');
  focusIfChanged(tile, { preventScroll: true });
  expect(focus).not.toHaveBeenCalled();
  const next = document.querySelector<HTMLButtonElement>('#next')!;
  const changed = vi.spyOn(next, 'focus');
  focusIfChanged(next, { preventScroll: true });
  expect(changed).toHaveBeenCalledWith({ preventScroll: true });
  expect(document.activeElement).toBe(next);
  expect(() => focusIfChanged(null, { preventScroll: true })).not.toThrow();
});

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
