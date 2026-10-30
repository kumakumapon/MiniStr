/** Preserve active controls while replacing surrounding markup; refresh all rendered attributes. */
export function retainControls(root: ParentNode, selectors: readonly string[]): () => void {
  const controls = selectors.flatMap((selector) => {
    const element = root.querySelector<HTMLElement>(selector);
    return element ? [{ selector, element }] : [];
  });
  return () => {
    for (const { selector, element } of controls) {
      const replacement = root.querySelector<HTMLElement>(selector);
      if (!replacement || replacement === element) continue;
      for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
      for (const attribute of replacement.attributes) element.setAttribute(attribute.name, attribute.value);
      element.innerHTML = replacement.innerHTML;
      replacement.replaceWith(element);
    }
  };
}
