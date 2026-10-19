import { describe, expect, it } from 'vitest';
import { parentOf } from './back-navigation';

describe('parentOf', () => {
  it('has no way back from the screens of the bottom bar', () => {
    for (const path of ['/', '/book', '/shifts', '/audit', '/more', '/book/2026-10']) {
      expect(parentOf(path, '2026-10'), path).toBeNull();
    }
  });

  it('goes up to the screen that lists the current one', () => {
    expect(parentOf('/book/2023-02', '2026-10')).toBe('/history');
    expect(parentOf('/history', '2026-10')).toBe('/book');
    expect(parentOf('/accounts/301', '2026-10')).toBe('/accounts');
    expect(parentOf('/accounts', '2026-10')).toBe('/more');
    expect(parentOf('/account/password', '2026-10')).toBe('/account');
    expect(parentOf('/admin/history/', '2026-10')).toBe('/admin');
    expect(parentOf('/admin', '2026-10')).toBe('/more');
    expect(parentOf('/tools', '2026-10')).toBe('/more');
    expect(parentOf('/tools/cash', '2026-10')).toBe('/tools');
    expect(parentOf('/elsewhere', '2026-10')).toBe('/');
  });
});
