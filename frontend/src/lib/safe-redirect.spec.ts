import { describe, expect, it } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it('keeps paths of this site', () => {
    expect(safeRedirect('/admin/users?tab=1')).toBe('/admin/users?tab=1');
  });

  it.each([undefined, '', 'https://evil.example', '//evil.example', '/\\evil.example'])(
    'falls back to home for %s',
    (target) => {
      expect(safeRedirect(target)).toBe('/');
    },
  );
});
