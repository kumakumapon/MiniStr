/** DOM redraws replace scroll containers. Restore them before restoring focus. */
export function captureRenderScroll(root: ParentNode, viewport: Window): () => void {
  const page = { x: viewport.scrollX, y: viewport.scrollY };
  const containers = ['board-viewport', 'production-menu-body'].map((id) => {
    const element = root.querySelector<HTMLElement>(`#${id}`);
    return { id, left: element?.scrollLeft ?? 0, top: element?.scrollTop ?? 0 };
  });
  return () => {
    for (const { id, left, top } of containers) {
      const element = root.querySelector<HTMLElement>(`#${id}`);
      if (element) {
        element.scrollLeft = left;
        element.scrollTop = top;
      }
    }
    if (viewport.scrollX !== page.x || viewport.scrollY !== page.y) viewport.scrollTo({ left: page.x, top: page.y, behavior: 'instant' });
  };
}
