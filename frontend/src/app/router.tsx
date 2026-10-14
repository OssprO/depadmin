import type { QueryClient } from '@tanstack/react-query';
import { UNIT_NUMBERS, yearMonthSchema } from '@depadmin/shared';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  notFound,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { auditFiltersFrom } from '@/features/audit/filters';
import { LoginPage } from '@/features/auth/routes/LoginPage';
import { HomePage } from '@/features/dashboard/routes/HomePage';
import { buildingToday } from '@/lib/format';
import { safeRedirect } from '@/lib/safe-redirect';
import type { SessionStore } from '@/lib/session';
import { AppLayout } from './AppLayout';
import { NotFound, RouteError } from './RouteError';

export interface RouterContext {
  readonly queryClient: QueryClient;
  readonly session: SessionStore;
}

const CHANGE_PASSWORD = '/account/password';

// Every screen but the first ones (login, home) loads on demand, in its own chunk: the
// phone downloads the book's code when the book is opened. Hovering or touching a link
// preloads it (defaultPreload: 'intent').
const AccountPage = lazyRouteComponent(
  () => import('@/features/account/routes/AccountPage'),
  'AccountPage',
);
const AccountStatementPage = lazyRouteComponent(
  () => import('@/features/accounts/routes/AccountStatementPage'),
  'AccountStatementPage',
);
const AccountsPage = lazyRouteComponent(
  () => import('@/features/accounts/routes/AccountsPage'),
  'AccountsPage',
);
const AdminPage = lazyRouteComponent(
  () => import('@/features/admin/routes/AdminPage'),
  'AdminPage',
);
const AuditLogPage = lazyRouteComponent(
  () => import('@/features/audit/routes/AuditLogPage'),
  'AuditLogPage',
);
const BookPage = lazyRouteComponent(() => import('@/features/book/routes/BookPage'), 'BookPage');
const ChangePasswordPage = lazyRouteComponent(
  () => import('@/features/auth/routes/ChangePasswordPage'),
  'ChangePasswordPage',
);
const HistoryPage = lazyRouteComponent(
  () => import('@/features/book/routes/HistoryPage'),
  'HistoryPage',
);
const MorePage = lazyRouteComponent(() => import('@/features/more/routes/MorePage'), 'MorePage');
const OpeningBalancesPage = lazyRouteComponent(
  () => import('@/features/admin/routes/OpeningBalancesPage'),
  'OpeningBalancesPage',
);
const ReportingStartPage = lazyRouteComponent(
  () => import('@/features/admin/routes/ReportingStartPage'),
  'ReportingStartPage',
);
const ShiftsPage = lazyRouteComponent(
  () => import('@/features/shifts/routes/ShiftsPage'),
  'ShiftsPage',
);
const UnitsPage = lazyRouteComponent(
  () => import('@/features/admin/routes/UnitsPage'),
  'UnitsPage',
);
const UsersPage = lazyRouteComponent(
  () => import('@/features/admin/routes/UsersPage'),
  'UsersPage',
);

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

/** The book opens on the current month in the building. */
const bookIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/book',
  beforeLoad: () => {
    throw redirect({ to: '/book/$month', params: { month: buildingToday().slice(0, 7) } });
  },
});

const bookRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/book/$month',
  params: {
    parse: ({ month }) => {
      if (!yearMonthSchema.safeParse(month).success) throw notFound();
      return { month };
    },
    stringify: ({ month }) => ({ month }),
  },
  component: function BookRoute() {
    const { month } = bookRoute.useParams();
    return <BookPage key={month} month={month} />;
  },
});

/** Every month since the books started. */
const historyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/history',
  component: HistoryPage,
});

const accountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts',
  component: AccountsPage,
});

const accountStatementRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts/$unit',
  params: {
    parse: ({ unit }) => {
      const number = Number(unit);
      if (!(UNIT_NUMBERS as readonly number[]).includes(number)) throw notFound();
      return { unit: number };
    },
    stringify: ({ unit }) => ({ unit: String(unit) }),
  },
  component: function AccountRoute() {
    return <AccountStatementPage unit={accountStatementRoute.useParams().unit} />;
  },
});

const moreRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/more',
  component: MorePage,
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

const reportingStartRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/start',
  component: ReportingStartPage,
});

const openingBalancesRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/opening',
  component: OpeningBalancesPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    homeRoute,
    bookIndexRoute,
    bookRoute,
    historyRoute,
    accountsRoute,
    accountStatementRoute,
    moreRoute,
    shiftsRoute,
    auditRoute,
    accountRoute,
    changePasswordRoute,
    adminRoute.addChildren([
      adminIndexRoute,
      usersRoute,
      unitsRoute,
      reportingStartRoute,
      openingBalancesRoute,
    ]),
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
