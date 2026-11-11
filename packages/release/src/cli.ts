// Prints the version of the commit checked out (HEAD), for the Deploy workflow:
//   node packages/release/src/cli.ts
// A commit already released keeps its version, so running a deploy again reuses it.
// It needs the whole history and the tags (actions/checkout with fetch-depth: 0).
import { execFileSync } from 'node:child_process';
import { newestVersion, nextVersion, tagOf } from './next-version.ts';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });
const lines = (output: string) => output.split('\n').filter(Boolean);

function versionOfHead(): string {
  const released = newestVersion(lines(git('tag', '--points-at', 'HEAD')));
  if (released) return released;

  const latest = newestVersion(lines(git('tag', '--merged', 'HEAD')));
  // %x1e (record separator) ends each message, since a body may hold blank lines.
  const messages = latest
    ? git('log', '--format=%B%x1e', `${tagOf(latest)}..HEAD`)
        .split('\x1e')
        .map((message) => message.trim())
        .filter(Boolean)
    : [];
  return nextVersion(latest, messages);
}

console.log(versionOfHead());
