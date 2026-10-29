import { afterEach, expect, it } from 'vitest';
import { createBrowserStorage } from './storage';
import { exportBackup } from '../game/backup';
afterEach(() => localStorage.clear());
it('rejects stale writes before the asynchronous storage event and preserves both snapshots', () => {
  localStorage.setItem('ministr.save.manual', 'original');
  const first = createBrowserStorage(() => localStorage);
  const second = createBrowserStorage(() => localStorage);
  second.setItem('ministr.save.manual', 'newer');
  expect(() => first.setItem('ministr.save.manual', 'stale')).toThrow();
  expect(first.conflicted).toBe(true);
  expect(localStorage.getItem('ministr.save.manual')).toBe('newer');
  const backup = exportBackup(first);
  expect(backup.ok && JSON.parse(backup.value).entries).toEqual([['ministr.save.manual', 'original']]);
});
it('detects external clear, additions and deletes on tab resume without absorbing them', () => {
  for (const mutation of [() => localStorage.clear(), () => localStorage.setItem('ministr.new', 'new'), () => localStorage.removeItem('ministr.old')]) {
    localStorage.clear();
    localStorage.setItem('ministr.old', 'old');
    const storage = createBrowserStorage(() => localStorage);
    expect(storage.checkForChanges()).toBe(false);
    mutation();
    expect(storage.checkForChanges()).toBe(true);
    expect(storage.getItem('ministr.old')).toBe('old');
    expect(() => storage.removeItem('ministr.old')).toThrow();
  }
});
it('ignores other apps and accepts its own completed writes', () => {
  const storage = createBrowserStorage(() => localStorage);
  localStorage.setItem('another-app', 'data');
  storage.setItem('ministr.test', 'one');
  storage.setItem('ministr.test', 'two');
  expect(storage.checkForChanges()).toBe(false);
  storage.removeItem('ministr.test');
  expect(storage.checkForChanges()).toBe(false);
});
