export const validCallsign = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 32 && [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
