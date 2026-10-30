import { describe, expect, it } from 'vitest';
import { createScenarioEditor, deploymentSlots, scenarioDefinitionToData } from '../game';
import { operation } from '../game/operations.fixture';
import { EditorHistory } from '../game/editorTools';
import { renderDeployment } from './deployment';
import { renderEditorView } from './editorView';
import { renderBriefingOverlay } from './overlays';

describe('deployment and evacuation controls', () => {
  it('renders labelled slots and budgets for each editable side and fixes escort targets', () => {
    const scenario = operation({ victoryConditions: [{ type: 'escort', unitIds: ['r1'], positions: [{ x: 3, y: 1 }], required: 1 }] });
    const choices = { red: deploymentSlots(scenario).map((slot) => slot.kind), blue: deploymentSlots(scenario, 'blue').map((slot) => slot.kind) };
    document.body.innerHTML = renderDeployment(scenario, choices, ['red', 'blue'], true, '');
    expect(document.querySelector('details')?.open).toBe(true);
    expect(document.querySelectorAll('fieldset')).toHaveLength(2);
    expect(document.querySelector<HTMLSelectElement>('#briefing-deployment-red-0')?.disabled).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#briefing-deployment-red-1')?.disabled).toBe(false);
    expect(document.querySelector<HTMLSelectElement>('#briefing-deployment-blue-0')?.getAttribute('aria-label')).toContain('青軍 b1');
    expect(document.querySelectorAll('.deployment-error')).toHaveLength(0);
    expect(document.querySelector('#briefing-deployment-reset')?.textContent).toContain('既定編成');
    document.body.innerHTML = renderDeployment(scenario, choices, ['red'], false, '');
    expect(document.querySelector('details')?.open).toBe(false);
    expect(document.querySelectorAll('fieldset')).toHaveLength(1);
  });

  it('announces budget errors and escapes notices, and blocks starting an invalid army', () => {
    const scenario = operation();
    const choices = { red: ['heavyTank', 'heavyTank', 'heavyTank'] as const, blue: deploymentSlots(scenario, 'blue').map((slot) => slot.kind) };
    const panel = renderDeployment(scenario, choices, ['red'], true, '<img src=x onerror=alert(1)>');
    document.body.innerHTML = renderBriefingOverlay({
      visible: true,
      mapName: 'Fixture',
      briefing: 'Orders',
      victoryConditions: ['Withdraw'],
      defeatConditions: ['Survive'],
      startingGold: 0,
      difficultyName: 'normal',
      campaignRun: false,
      deployment: panel,
      beginDisabled: true,
    });
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(2);
    expect(document.querySelector('.deployment-error')?.textContent).toContain('予算');
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('#begin-operation')?.disabled).toBe(true);
    document.body.innerHTML = renderBriefingOverlay({
      visible: true,
      mapName: 'Fixture',
      briefing: '',
      victoryConditions: [],
      defeatConditions: [],
      startingGold: 0,
      difficultyName: '',
      campaignRun: false,
      deployment: panel,
      beginDisabled: false,
    });
    expect(document.querySelector<HTMLButtonElement>('#begin-operation')?.disabled).toBe(false);
  });

  it.each(['escort', 'withdraw'] as const)('shows %s target IDs, required count and exit editing controls', (type) => {
    const editor = {
      ...createScenarioEditor(),
      data: scenarioDefinitionToData(operation({ victoryConditions: [{ type, unitIds: ['r1', 'r2'], positions: [{ x: 3, y: 1 }], required: 2 }] })),
    };
    document.body.innerHTML = renderEditorView(editor, '', 'brush', new EditorHistory());
    expect(document.querySelector<HTMLSelectElement>('#editor-victory')?.value).toBe(type);
    expect(document.querySelector<HTMLInputElement>('#editor-victory-target')?.value).toBe('2');
    expect(document.querySelector<HTMLInputElement>('#editor-victory-units')?.value).toBe('r1, r2');
    expect(document.querySelector('#editor-use-exit')).not.toBeNull();
    expect(document.querySelectorAll('.editor-unit-id')).toHaveLength(5);
    expect(document.querySelector('[data-editor-x="7"][data-editor-y="2"]')?.getAttribute('aria-label')).toContain('b1');
  });
});

it.each(['x', 'y'] as const)('does not interpret a malformed deployment %s coordinate as HTML', (axis) => {
  const scenario = operation({ victoryConditions: [{ type: 'escort', unitIds: ['r1'], positions: [{ x: 3, y: 1 }], required: 1 }] });
  scenario.initialUnits[0]![axis] = '<img data-injected="true" src="x">' as never;
  const choices = { red: deploymentSlots(scenario).map((slot) => slot.kind), blue: [] };
  document.body.innerHTML = renderDeployment(scenario, choices, ['red'], true, '');
  expect(document.querySelector('[data-injected]')).toBeNull();
  expect(document.querySelector('.deployment-slot span')?.textContent).toContain('NaN');
});
