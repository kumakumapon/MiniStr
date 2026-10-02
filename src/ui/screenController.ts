export type AppScreen = 'title' | 'battle' | 'briefing' | 'campaign' | 'editor';

/** Exclusive modal state; closing an inactive screen cannot dismiss another. */
export class ScreenController {
  private screen: AppScreen = 'title';
  get current(): AppScreen {
    return this.screen;
  }
  open(screen: AppScreen): void {
    this.screen = screen;
  }
  close(screen: AppScreen): void {
    if (this.screen === screen) this.screen = 'battle';
  }
  get titleOpen() {
    return this.screen === 'title';
  }
  set titleOpen(value: boolean) {
    if (value) this.open('title');
    else this.close('title');
  }
  get briefingOpen() {
    return this.screen === 'briefing';
  }
  set briefingOpen(value: boolean) {
    if (value) this.open('briefing');
    else this.close('briefing');
  }
  get campaignMenuOpen() {
    return this.screen === 'campaign';
  }
  set campaignMenuOpen(value: boolean) {
    if (value) this.open('campaign');
    else this.close('campaign');
  }
  get editorOpen() {
    return this.screen === 'editor';
  }
  set editorOpen(value: boolean) {
    if (value) this.open('editor');
    else this.close('editor');
  }
}
