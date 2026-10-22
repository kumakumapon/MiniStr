import { COMMAND_SPEEDS, type CommandSpeed } from './commandScheduler';
import { getLocale } from './locale';

/** Title and in-game selectors share one set of CPU pacing options. */
export function renderCpuSpeedControl(speed: CommandSpeed, id: 'cpu-speed' | 'title-cpu-speed', disabled = false): string {
  const english = getLocale() === 'en';
  return `<label class="map-picker cpu-speed-control">${english ? 'CPU speed' : 'CPU速度'}<select id="${id}" aria-label="${english ? 'CPU action speed' : 'CPUの行動速度を選択'}" ${disabled ? 'disabled' : ''}>${COMMAND_SPEEDS.map((value) => `<option value="${value}" ${value === speed ? 'selected' : ''}>${value}x</option>`).join('')}</select></label>`;
}
