export interface RecoverableAudio {
  recover(): Promise<void>;
}

/** App switches and BFCache returns are independent from the next user gesture. */
export function installAudioRecovery(players: readonly RecoverableAudio[], page: Document = document, browser: Window = window): () => void {
  const recover = () => {
    if (page.hidden) return;
    for (const player of players)
      void player.recover().catch(() => {
        /* The next trusted gesture retries autoplay denials. */
      });
  };
  page.addEventListener('visibilitychange', recover);
  browser.addEventListener('pageshow', recover);
  browser.addEventListener('focus', recover);
  return () => {
    page.removeEventListener('visibilitychange', recover);
    browser.removeEventListener('pageshow', recover);
    browser.removeEventListener('focus', recover);
  };
}
