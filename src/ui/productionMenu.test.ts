import { describe, expect, it } from 'vitest';
import { renderProductionMenu } from './productionMenu';

describe('production menu', () => {
  it('keeps the selected facility, funds and feedback available above the roster', () => {
    document.body.innerHTML = renderProductionMenu({
      facilities: [
        { position: { x: 0, y: 3 }, kind: 'factory', kinds: ['infantry'] },
        { position: { x: 2, y: 1 }, kind: 'airport', kinds: ['fighter'] },
      ],
      target: { x: 2, y: 1 },
      funds: 6000,
      summary: '<p>2 facilities</p>',
      units: '<button class="produce">Fighter</button>',
      notice: '次の施設に切り替えました。',
    });
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')!;
    const select = dialog.querySelector<HTMLSelectElement>('select')!;
    expect(select.value).toBe('2,1');
    expect(select.options[1]?.textContent).toContain('(3, 2)');
    expect(dialog.querySelector('.production-menu-controls')?.textContent).toContain('6000G');
    expect(dialog.querySelector('[role="status"]')?.textContent).toBe('次の施設に切り替えました。');
    expect(dialog.querySelector('#production-menu-body')?.contains(select)).toBe(false);
  });

  it('explains exhausted facilities while keeping close accessible and escaping notices', () => {
    document.body.innerHTML = renderProductionMenu({
      facilities: [],
      target: undefined,
      funds: 0,
      summary: '',
      units: '<button>unavailable</button>',
      notice: '<script>bad</script>',
    });
    expect(document.querySelector<HTMLSelectElement>('select')?.disabled).toBe(true);
    expect(document.querySelector('#production-menu-body')?.textContent).toContain('空き施設がありません');
    expect(document.querySelector('#production-menu-body button')).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('#production-menu-close')?.disabled).toBe(false);
    expect(document.querySelector('script')).toBeNull();
  });
});
