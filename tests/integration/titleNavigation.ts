/** Exercise the distributed app's home controls before addressing a panel-specific control. */
export function openTitlePanel(document: Document, panel: 'home' | 'settings' | 'records'): void {
  const screen = document.querySelector<HTMLElement>('.title-screen');
  if (!screen || screen.dataset.titlePanel === panel) return;
  if (screen.dataset.titlePanel !== 'home') document.querySelector<HTMLButtonElement>('#title-home-back')!.click();
  if (panel !== 'home') document.querySelector<HTMLButtonElement>(`#title-open-${panel}`)!.click();
}
