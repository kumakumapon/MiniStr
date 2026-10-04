import { describe, expect, it } from 'vitest';
import { installModalFocusTrap } from './modalFocus';

describe('modal keyboard focus', () => {
  it('wraps Tab and Shift+Tab and redirects outside focus', () => {
    document.body.innerHTML = '<button id="outside">Outside</button><div role="dialog" aria-modal="true"><button id="first">First</button><button id="last">Last</button></div>';
    installModalFocusTrap(document);
    document.querySelector<HTMLButtonElement>('#outside')!.focus();
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(tab);
    expect(document.activeElement?.id).toBe('first');
    expect(tab.defaultPrevented).toBe(true);

    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(shiftTab);
    expect(document.activeElement?.id).toBe('last');
    expect(shiftTab.defaultPrevented).toBe(true);
  });
});
