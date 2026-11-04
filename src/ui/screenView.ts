import { syncAttributes } from './domAttributes';

/** Only these structural containers survive a redraw. Controls get fresh listeners. */
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

/**
 * Keep the board attached to the same ancestors so the browser can reuse grid
 * layout. Replacing the screen and then reinserting its old board invalidates
 * layout for every tile, even when BoardView changes only two of them.
 *
 * Markup comes from the existing escaped screen templates. Nothing is cached:
 * overlays and every control outside the board path are replaced on each call.
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
  let currentParent: HTMLElement = root;
  let nextParent: ParentNode = template.content;
  for (let index = 0; index < currentPath.length; index++) {
    const current = currentPath[index]!;
    const next = nextPath[index]!;
    // Never remove/reinsert current, including through replaceChildren().
    for (const node of [...currentParent.childNodes]) if (node !== current) node.remove();
    const before = document.createDocumentFragment();
    const after = document.createDocumentFragment();
    let passed = false;
    for (const node of [...nextParent.childNodes]) {
      if (node === next) passed = true;
      else (passed ? after : before).append(node);
    }
    currentParent.insertBefore(before, current);
    currentParent.append(after);
    syncAttributes(current, next);
    currentParent = current;
    nextParent = next;
  }
  // BoardView updates cells (or invalidates locale/view identities) separately.
}
