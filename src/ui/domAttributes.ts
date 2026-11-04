/** Apply the complete rendered attribute model without rewriting unchanged values. */
export function syncAttributes(current: HTMLElement, next: HTMLElement): void {
  for (const attribute of [...current.attributes]) if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  for (const attribute of next.attributes) if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
}
