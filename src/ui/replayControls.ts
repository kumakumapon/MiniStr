import type { ReplayTimeline } from "../game/replayTimeline";
import type { PlayerId } from "../game";
import { escapeHtml } from "./strings";

export function renderReplayNavigation(
  index: number,
  count: number,
  viewpoint: PlayerId | "all",
  timeline: ReplayTimeline,
): string {
  const events = Array.from({ length: Math.min(8, index) }, (_, offset) => {
    const at = index - Math.min(8, index) + offset;
    return `<li><button class="replay-event save-action" data-index="${at + 1}">${at + 1}: ${escapeHtml(timeline.event(at, viewpoint))}</button></li>`;
  }).join("");
  return `<div class="replay-navigation"><button id="replay-back" class="save-action" ${index === 0 ? "disabled" : ""}>1手戻る</button><label>位置<input id="replay-seek" aria-label="リプレイ位置" type="range" min="0" max="${count}" value="${index}"></label><label>視点<select id="replay-viewpoint"><option value="red" ${viewpoint === "red" ? "selected" : ""}>赤軍</option><option value="blue" ${viewpoint === "blue" ? "selected" : ""}>青軍</option><option value="all" ${viewpoint === "all" ? "selected" : ""}>全体（対局終了後）</option></select></label><ol aria-label="直前のイベント">${events}</ol></div>`;
}
