/**
 * Where "Atrás" leads when there is no earlier screen of the app to return to (the page was
 * opened from a link or reloaded). Null on the screens the bottom bar opens, which have no
 * "Atrás".
 */
export function parentOf(pathname: string, currentMonth: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (['/', '/book', '/shifts', '/audit', '/more'].includes(path)) return null;
  if (path === `/book/${currentMonth}`) return null;
  if (path.startsWith('/book/')) return '/history';
  if (path === '/history') return '/book';
  if (path === '/accounts' || path === '/account' || path === '/admin') return '/more';
  if (path.startsWith('/accounts/')) return '/accounts';
  if (path.startsWith('/account/')) return '/account';
  if (path.startsWith('/admin/')) return '/admin';
  return '/';
}
