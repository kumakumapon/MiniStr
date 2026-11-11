import { syncAttributes } from './domAttributes';

/** The board path stays connected; an unchanged open logistics view may keep its controls too. */
const boardPath = ['main.game-shell', '.battle-layout', '.battlefield-wrap', '.battlefield-stage', '#board-viewport', '.board'] as const;

function path(root: ParentNode): HTMLElement[] | undefined {
  const result: HTMLElement[] = [];
  for (const selector of boardPath) {
    const element: HTMLElement | undefined = [...root.children].find((child): child is HTMLElement => child instanceof HTMLElement && child.matches(selector));
    if (!element) return;
    result.push(element);
    root = element;
  }
  return result;
}

/** Insert fresh siblings around connected anchors, preserving their order and native focus. */
function updateChildren(current: HTMLElement, next: ParentNode, retained: Map<Node, Node>): void {
  const anchors = new Set(retained.values());
  for (const node of [...current.childNodes]) if (!anchors.has(node)) node.remove();
  let pending = document.createDocumentFragment();
  for (const node of [...next.childNodes]) {
    const anchor = retained.get(node);
    if (anchor) {
      current.insertBefore(pending, anchor);
      pending = document.createDocumentFragment();
    } else pending.append(node);
  }
  current.append(pending);
}

/**
 * Keep the board attached to the same ancestors so the browser can reuse grid
 * layout. Replacing the screen and then reinserting its old board invalidates
 * layout for every tile, even when BoardView changes only two of them.
 *
 * Markup comes from the existing escaped screen templates. A logistics view
 * with the same immutable-state identity also keeps its controls connected.
 */
export function updateScreen(root: HTMLElement, markup: string, retainBoard: boolean): void {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const currentPath = retainBoard ? path(root) : undefined;
  const nextPath = currentPath ? path(template.content) : undefined;
  if (!currentPath || !nextPath) {
    root.replaceChildren(template.content);
    return;
  }
  const currentPanel = currentPath[1]!.querySelector<HTMLElement>(':scope > #command-panel');
  const nextPanel = nextPath[1]!.querySelector<HTMLElement>(':scope > #command-panel');
  const currentRoster = currentPanel?.querySelector<HTMLElement>(':scope > #logistics-roster');
  const nextRoster = nextPanel?.querySelector<HTMLElement>(':scope > #logistics-roster');
  const samePanelOrder =
    currentPanel &&
    nextPanel &&
    Array.from(currentPath[1]!.children).indexOf(currentPanel) > Array.from(currentPath[1]!.children).indexOf(currentPath[2]!) ===
      Array.from(nextPath[1]!.children).indexOf(nextPanel) > Array.from(nextPath[1]!.children).indexOf(nextPath[2]!);
  const retainRoster =
    samePanelOrder &&
    currentRoster?.hasAttribute('open') &&
    nextRoster?.hasAttribute('open') &&
    currentRoster.dataset.logisticsView &&
    currentRoster.dataset.logisticsView === nextRoster.dataset.logisticsView;
  if (retainRoster && currentPanel && nextPanel && currentRoster && nextRoster) {
    updateChildren(currentPanel, nextPanel, new Map([[nextRoster, currentRoster]]));
    syncAttributes(currentPanel, nextPanel);
    syncAttributes(currentRoster, nextRoster);
  }
  let currentParent: HTMLElement = root;
  let nextParent: ParentNode = template.content;
  for (let index = 0; index < currentPath.length; index++) {
    const current = currentPath[index]!;
    const next = nextPath[index]!;
    const retained = new Map<Node, Node>([[next, current]]);
    if (index === 2 && retainRoster && currentPanel && nextPanel) retained.set(nextPanel, currentPanel);
    updateChildren(currentParent, nextParent, retained);
    syncAttributes(current, next);
    currentParent = current;
    nextParent = next;
  }
  // BoardView updates cells (or invalidates locale/view identities) separately.
}
