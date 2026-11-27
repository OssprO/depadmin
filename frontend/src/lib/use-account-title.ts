import type { CurrentUser } from '@depadmin/shared';
import { useEffect } from 'react';
import { accountTitle } from './user-label';

/** Puts the account in the tab's title while the session lasts, and puts the old one back. */
export function useAccountTitle(user: Pick<CurrentUser, 'role' | 'unit' | 'username'>): void {
  const title = accountTitle(user);
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
