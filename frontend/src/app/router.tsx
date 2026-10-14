import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { AccountPage } from '@/features/account/routes/AccountPage';
import { AdminPage } from '@/features/admin/routes/AdminPage';
import { UnitsPage } from '@/features/admin/routes/UnitsPage';
import { UsersPage } from '@/features/admin/routes/UsersPage';
import { auditFiltersFrom } from '@/features/audit/filters';
import { AuditLogPage } from '@/features/audit/routes/AuditLogPage';
import { ChangePasswordPage } from '@/features/auth/routes/ChangePasswordPage';
import { LoginPage } from '@/features/auth/routes/LoginPage';
import { HomePage } from '@/features/dashboard/routes/HomePage';
import { ShiftsPage } from '@/features/shifts/routes/ShiftsPage';
import { safeRedirect } from '@/lib/safe-redirect';
import type { SessionStore } from '@/lib/session';
import { AppLayout } from './AppLayout';
import { NotFound, RouteError } from './RouteError';

export interface RouterContext {
  readonly queryClient: QueryClient;
  readonly session: SessionStore;
}

const CHANGE_PASSWORD = '/account/password';

// The route tree is declared in code, in one place, while each screen lives in its feature
// folder. Guards run in `beforeLoad`, before anything renders. They are about navigation
// only: the API enforces the same rules on every request.

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search['redirect'] === 'string' ? { redirect: search['redirect'] } : {},
  beforeLoad: async ({ context, search }) => {
    if (await context.session.restore()) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

/** Everything below requires a session. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context, location }) => {
    const user = await context.session.restore();
    if (!user) throw redirect({ to: '/login', search: { redirect: location.href } });
    if (user.mustChangePassword && location.pathname !== CHANGE_PASSWORD) {
      throw redirect({ to: CHANGE_PASSWORD });
    }
    return { user };
  },
  component: AppLayout,
});

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: HomePage,
});

const accountRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/account',
  component: AccountPage,
});

const changePasswordRoute = createRoute({
  getParentRoute: () => appRoute,
  path: CHANGE_PASSWORD,
  component: ChangePasswordPage,
});

const shiftsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/shifts',
  component: ShiftsPage,
});

/** The superadmin's tools. */
const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin',
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'SUPERADMIN') throw redirect({ to: '/' });
  },
  component: Outlet,
});

const adminIndexRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/',
  component: AdminPage,
});

const usersRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/users',
  component: UsersPage,
});

const unitsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/units',
  component: UnitsPage,
});

/** Its filters live in the URL, so they survive a reload and the back button. */
const auditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/audit',
  validateSearch: auditFiltersFrom,
  component: function AuditRoute() {
    const navigate = auditRoute.useNavigate();
    return (
      <AuditLogPage
        filters={auditRoute.useSearch()}
        onFiltersChange={(search) => void navigate({ search, replace: true })}
      />
    );
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    homeRoute,
    shiftsRoute,
    auditRoute,
    accountRoute,
    changePasswordRoute,
    adminRoute.addChildren([adminIndexRoute, usersRoute, unitsRoute]),
  ]),
]);

export function createAppRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context,
    ...(history && { history }),
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
