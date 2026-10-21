import { useRouter } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import type { SessionStore } from './session';

/** The session store the router was created with. */
export function useSessionStore(): SessionStore {
  return useRouter().options.context.session;
}

/** The signed-in user. Only for screens under the authenticated layout. */
export function useCurrentUser() {
  const store = useSessionStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  if (state.status !== 'authenticated') throw new Error('useCurrentUser() outside a session');
  return state.user;
}
