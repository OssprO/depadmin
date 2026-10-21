import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { App } from '@/app/App';
import { createQueryClient } from '@/app/query-client';
import { createAppRouter } from '@/app/router';
import { connectSession } from '@/lib/http';
import { SessionStore } from '@/lib/session';

/** The whole app at `path`, with its own session and cache, against the stubbed `fetch`. */
export function renderApp(path: string) {
  const session = new SessionStore();
  const queryClient = createQueryClient();
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createAppRouter({ queryClient, session }, history);
  connectSession(session);
  return { ...render(<App router={router} queryClient={queryClient} />), router, session };
}
