import { describe, expect, it } from 'vitest';
import { bumpFor, bumpOf, newestVersion, nextVersion, versionOf } from './next-version.ts';

describe('bumpOf', () => {
  it('reads a feature as a minor change', () => {
    expect(bumpOf('feat(book): show the paper sheet')).toBe('minor');
    expect(bumpOf('Feat: capitalised')).toBe('minor');
  });

  it('reads a breaking change from the ! or the footer', () => {
    expect(bumpOf('feat(api)!: drop the v1 routes')).toBe('major');
    expect(bumpOf('fix!: change the error codes')).toBe('major');
    expect(bumpOf('refactor: rename\n\nBREAKING CHANGE: the env var is now TRUST_PROXY')).toBe(
      'major',
    );
    expect(bumpOf('refactor: rename\n\nBREAKING-CHANGE: another spelling')).toBe('major');
  });

  it('reads anything else as a patch, merges and free-form messages included', () => {
    expect(bumpOf('fix(billing): allocate oldest first')).toBe('patch');
    expect(bumpOf('docs: deployment guide')).toBe('patch');
    expect(bumpOf('Merge pull request #20 from OssprO/develop')).toBe('patch');
    expect(bumpOf('featuring nothing')).toBe('patch');
  });

  it('does not take a mention of a breaking change in the text for its footer', () => {
    expect(bumpOf('docs: explain what a BREAKING CHANGE: footer does')).toBe('patch');
  });
});

describe('bumpFor', () => {
  it('takes the largest bump of the commits', () => {
    expect(bumpFor(['fix: a', 'feat: b', 'docs: c'])).toBe('minor');
    expect(bumpFor(['feat: a', 'chore!: b'])).toBe('major');
    expect(bumpFor(['ci: a'])).toBe('patch');
  });

  it('moves the patch even with no commits, since every deploy is a release', () => {
    expect(bumpFor([])).toBe('patch');
  });
});

describe('nextVersion', () => {
  it('starts at 1.0.0', () => {
    expect(nextVersion(null, ['feat: everything'])).toBe('1.0.0');
  });

  it('bumps one part and resets the ones after it', () => {
    expect(nextVersion('1.2.3', ['fix: a'])).toBe('1.2.4');
    expect(nextVersion('1.2.3', ['feat: a'])).toBe('1.3.0');
    expect(nextVersion('1.2.3', ['feat!: a'])).toBe('2.0.0');
  });

  it('rejects a latest version that is not one', () => {
    expect(() => nextVersion('1.2', [])).toThrow('Not a version: 1.2');
  });
});

describe('release tags', () => {
  it('reads only tags of the form v1.2.3', () => {
    expect(versionOf('v1.2.3')).toBe('1.2.3');
    expect(versionOf('1.2.3')).toBeNull();
    expect(versionOf('v1.2')).toBeNull();
    expect(versionOf('v1.2.3-rc.1')).toBeNull();
  });

  it('finds the newest version in semantic order', () => {
    expect(newestVersion(['v1.9.0', 'v1.10.0', 'v1.2.30', 'nightly'])).toBe('1.10.0');
    expect(newestVersion(['v2.0.0', 'v1.99.99'])).toBe('2.0.0');
    expect(newestVersion(['nightly'])).toBeNull();
    expect(newestVersion([])).toBeNull();
  });
});
