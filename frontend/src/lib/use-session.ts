import { useRouter } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import type { SessionState, SessionStore } from './session';

/** The session store the router was created with. */
export function useSessionStore(): SessionStore {
  return useRouter().options.context.session;
}

/** The session as it is now, re-rendering when it changes (sign-in, refresh, sign-out). */
export function useSessionState(): SessionState {
  const store = useSessionStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/**
 * The signed-in user. Only for screens under the authenticated layout, which stops
 * rendering them as soon as the session ends (`AppLayout`).
 */
export function useCurrentUser() {
  const state = useSessionState();
  if (state.status !== 'authenticated') throw new Error('useCurrentUser() outside a session');
  return state.user;
}
