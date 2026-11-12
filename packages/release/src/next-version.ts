// The app's version (docs/adr/0027-versiones.md): semantic, computed from the Conventional
// Commits that reach main since the last release. Every deploy is a release, so a change
// that is neither a feature nor a breaking change still moves the patch number.

export type Bump = 'major' | 'minor' | 'patch';

/** The version the first release takes, when no earlier one is tagged. */
export const FIRST_VERSION = '1.0.0';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
// type(scope)!: subject
const HEADER = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<breaking>!)?: /i;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: /m;

/** What one commit message (subject and body) asks of the version. */
export function bumpOf(message: string): Bump {
  const header = HEADER.exec(message);
  if (header?.groups?.['breaking'] || BREAKING_FOOTER.test(message)) return 'major';
  if (header?.groups?.['type']?.toLowerCase() === 'feat') return 'minor';
  return 'patch';
}

/** The largest bump the commits ask for; a release always moves at least the patch. */
export function bumpFor(messages: readonly string[]): Bump {
  const bumps = messages.map(bumpOf);
  if (bumps.includes('major')) return 'major';
  if (bumps.includes('minor')) return 'minor';
  return 'patch';
}

/** The version after `latest` (e.g. "1.2.3") with the commits since it. */
export function nextVersion(latest: string | null, messages: readonly string[]): string {
  if (latest === null) return FIRST_VERSION;
  const parts = SEMVER.exec(latest);
  if (!parts) throw new Error(`Not a version: ${latest}`);
  const [major, minor, patch] = parts.slice(1).map(Number) as [number, number, number];
  switch (bumpFor(messages)) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

/** The tag of a version: "1.2.3" → "v1.2.3". */
export const tagOf = (version: string) => `v${version}`;

/** The version of a release tag ("v1.2.3" → "1.2.3"), or null if it is not one. */
export function versionOf(tag: string): string | null {
  const version = tag.startsWith('v') ? tag.slice(1) : null;
  return version && SEMVER.test(version) ? version : null;
}

/** The newest version among some tags, by semantic order (not by text: 1.10.0 > 1.9.0). */
export function newestVersion(tags: readonly string[]): string | null {
  const versions = tags.map(versionOf).filter((version) => version !== null);
  const key = (version: string) => version.split('.').map(Number);
  return versions.reduce<string | null>((newest, version) => {
    if (newest === null) return version;
    const [a, b] = [key(version), key(newest)];
    const index = a.findIndex((part, i) => part !== b[i]);
    return index >= 0 && a[index]! > b[index]! ? version : newest;
  }, null);
}
