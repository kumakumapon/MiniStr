/** DOM redraws replace scroll containers. Restore them before restoring focus. */
export function captureRenderScroll(root: ParentNode, viewport: Window, skipBoard = false): () => void {
  const page = { x: viewport.scrollX, y: viewport.scrollY };
  const containers = (skipBoard ? ['production-menu-body'] : ['board-viewport', 'production-menu-body']).flatMap((id) => {
    const element = root.querySelector<HTMLElement>(`#${id}`);
    const left = element?.scrollLeft ?? 0,
      top = element?.scrollTop ?? 0;
    // Newly rendered containers start at the origin. Even writing zero forces
    // layout in browsers, before the remaining screen copy has been localized.
    return left || top ? [{ id, left, top }] : [];
  });
  return () => {
    for (const { id, left, top } of containers) {
      const element = root.querySelector<HTMLElement>(`#${id}`);
      if (element) {
        element.scrollLeft = left;
        element.scrollTop = top;
      }
    }
    // Replacing the screen cannot move a page at the origin forward. Avoid a
    // post-write geometry read; a nonzero position is restored in one operation.
    if (page.x || page.y) viewport.scrollTo({ left: page.x, top: page.y, behavior: 'instant' });
  };
}
