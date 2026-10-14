import {
  type CurrentUser,
  type LoginRequest,
  type SessionResponse,
  sessionResponseSchema,
} from '@depadmin/shared';
import { readApiError } from './api-error';
import { send } from './transport';

export type SessionState =
  | { readonly status: 'unknown' }
  | { readonly status: 'anonymous' }
  | { readonly status: 'authenticated'; readonly user: CurrentUser; readonly accessToken: string };

const REFRESH_LOCK = 'depadmin-refresh';

/**
 * The signed-in user and their access token, kept only in memory: a page reload loses it
 * and `restore()` gets a new one from the httpOnly refresh cookie, which JavaScript never
 * sees. Components read it through `useSession()`; the HTTP client through `accessToken`.
 */
export class SessionStore {
  private state: SessionState = { status: 'unknown' };
  private readonly listeners = new Set<() => void>();
  private refreshing: Promise<string | null> | null = null;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SessionState => this.state;

  get user(): CurrentUser | null {
    return this.state.status === 'authenticated' ? this.state.user : null;
  }

  get accessToken(): string | null {
    return this.state.status === 'authenticated' ? this.state.accessToken : null;
  }

  /** On first use after a page load, resumes the session from the refresh cookie, if any. */
  async restore(): Promise<CurrentUser | null> {
    if (this.state.status === 'unknown') await this.refresh();
    return this.user;
  }

  /**
   * A new access token, or null when the session is over. Concurrent calls share one
   * request, and tabs take turns through the Web Locks API: the API rotates the refresh
   * token on every use and treats a second use of the same one as theft, so two tabs
   * refreshing at once would sign the user out.
   */
  refresh(): Promise<string | null> {
    this.refreshing ??= withLock(REFRESH_LOCK, () => this.requestRefresh()).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async login(credentials: LoginRequest): Promise<CurrentUser> {
    const response = await post('/api/auth/login', credentials);
    if (!response.ok) throw await readApiError(response);
    return this.accept(sessionResponseSchema.parse(await response.json()));
  }

  /** Ends the session on the server too; locally it ends even if the server is unreachable. */
  async logout(): Promise<void> {
    try {
      await post('/api/auth/logout');
    } catch {
      // Offline: the refresh token expires on its own.
    } finally {
      this.set({ status: 'anonymous' });
    }
  }

  /** Takes a session the API just issued (login, refresh, password change). */
  accept(session: SessionResponse): CurrentUser {
    this.set({ status: 'authenticated', user: session.user, accessToken: session.accessToken });
    return session.user;
  }

  private async requestRefresh(): Promise<string | null> {
    const response = await post('/api/auth/refresh');
    if (response.status === 401) {
      this.set({ status: 'anonymous' });
      return null;
    }
    if (!response.ok) throw await readApiError(response);
    this.accept(sessionResponseSchema.parse(await response.json()));
    return this.accessToken;
  }

  private set(state: SessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

function post(url: string, body?: unknown): Promise<Response> {
  return send(url, { method: 'POST', body });
}

function withLock<T>(name: string, work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request(name, work) : work();
}

/** The app's session. Tests create their own `SessionStore` instead. */
export const session = new SessionStore();
