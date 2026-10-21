/**
 * Where to go after signing in. Only same-site paths are accepted, so a crafted link like
 * `/login?redirect=https://evil.example` cannot send the user elsewhere.
 */
export function safeRedirect(target: string | undefined): string {
  if (!target?.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return '/';
  return target;
}
