import {
  BookOpenTextIcon,
  CalendarDotsIcon,
  CaretLeftIcon,
  ClockCounterClockwiseIcon,
  DotsThreeOutlineIcon,
  HouseIcon,
  ListBulletsIcon,
  ReceiptIcon,
  ToolboxIcon,
  UserCircleIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import {
  Link,
  type LinkProps,
  Outlet,
  useCanGoBack,
  useNavigate,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { SystemStatus } from '@/features/system-status/SystemStatus';
import { buildingToday } from '@/lib/format';
import { useWideScreen } from '@/lib/use-media-query';
import { useCurrentUser } from '@/lib/use-session';
import { cn } from '@/lib/utils';
import { parentOf } from './back-navigation';

interface NavItemProps {
  readonly to: NonNullable<LinkProps['to']>;
  readonly icon: ReactNode;
  readonly label: string;
  /** Other sections reached from this tab, which keep it highlighted. */
  readonly sections?: readonly string[];
}

function NavItem({ to, icon, label, sections = [] }: NavItemProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const inSection = sections.some((section) => pathname.startsWith(section));
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === '/' }}
      data-section={inSection || undefined}
      className="flex flex-1 flex-col items-center gap-1 py-2 text-muted-foreground data-[section]:text-foreground data-[status=active]:text-foreground [&_svg]:size-6"
    >
      {icon}
      <span className="text-[0.65rem]">{label}</span>
    </Link>
  );
}

/** On a wide screen these are in the side menu, so they need no "Atrás" there. */
const SIDE_MENU_ROOTS = ['/history', '/accounts', '/tools', '/admin', '/account'];

/**
 * "Atrás" on every screen the menu does not open: back to the previous screen of the app,
 * or up to the one that lists this one when the page was opened directly.
 */
function BackButton() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const parent = parentOf(pathname, buildingToday().slice(0, 7));
  if (!parent) return null;
  const inSideMenu = SIDE_MENU_ROOTS.includes(pathname.replace(/\/+$/, ''));
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-2 self-start', inSideMenu && 'md:hidden')}
      onClick={() => {
        if (canGoBack) router.history.back();
        else void navigate({ to: parent });
      }}
    >
      <CaretLeftIcon /> Atrás
    </Button>
  );
}

function SideItem({ to, icon, label, sections = [] }: NavItemProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const inSection = sections.some((section) => pathname.startsWith(section));
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === '/' }}
      data-section={inSection || undefined}
      className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[section]:bg-sidebar-accent data-[section]:font-medium data-[section]:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-accent-foreground [&_svg]:size-5"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

/**
 * The signed-in shell. On the phone, content on top and thumb-reachable navigation at the
 * bottom; from a tablet up (`md`), a fixed side menu with every section and wider content.
 */
export function AppLayout() {
  const user = useCurrentUser();
  // A user with a temporary password can only change it; there is nowhere else to go.
  const showNav = !user.mustChangePassword;
  // One menu at a time, so there is a single main navigation for assistive technology.
  const wide = useWideScreen();

  return (
    <div className={cn('min-h-svh', showNav && 'md:pl-56 lg:pl-64')}>
      {showNav && wide && (
        <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col gap-6 overflow-y-auto border-r bg-sidebar px-3 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 text-sidebar-foreground md:flex lg:w-64">
          <div className="px-3">
            <Brand compact />
          </div>
          <nav aria-label="Principal" className="flex flex-col gap-1">
            <SideItem to="/" icon={<HouseIcon />} label="Inicio" />
            <SideItem to="/book" icon={<BookOpenTextIcon />} label="Libro" sections={['/book/']} />
            <SideItem to="/history" icon={<ListBulletsIcon />} label="Histórico" />
            <SideItem to="/shifts" icon={<CalendarDotsIcon />} label="Turnos" />
            <SideItem to="/audit" icon={<ClockCounterClockwiseIcon />} label="Bitácora" />
            <SideItem to="/accounts" icon={<ReceiptIcon />} label="Estados de cuenta" />
            <SideItem to="/tools" icon={<ToolboxIcon />} label="Herramientas" />
            {user.role === 'SUPERADMIN' && (
              <SideItem to="/admin" icon={<WrenchIcon />} label="Administración" />
            )}
            <SideItem to="/account" icon={<UserCircleIcon />} label="Mi cuenta" />
          </nav>
          <footer className="mt-auto border-t px-3 pt-4">
            <SystemStatus />
          </footer>
        </aside>
      )}
      <div
        className={cn(
          'mx-auto flex min-h-svh w-full max-w-md flex-col',
          showNav && 'md:max-w-3xl lg:max-w-5xl',
        )}
      >
        <header className="flex flex-col gap-2 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4 md:px-8">
          <div className={cn(showNav && 'md:hidden')}>
            <Brand />
          </div>
          {showNav && <BackButton />}
        </header>
        <main
          className={cn(
            'flex flex-1 flex-col gap-4 px-4 md:px-8',
            showNav ? 'pb-24 md:pb-8' : 'pb-6',
          )}
        >
          <Outlet />
        </main>
      </div>
      {showNav && !wide && (
        <nav
          aria-label="Principal"
          className="fixed inset-x-0 bottom-0 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <div className="mx-auto flex max-w-md">
            <NavItem to="/" icon={<HouseIcon />} label="Inicio" />
            <NavItem to="/book" icon={<BookOpenTextIcon />} label="Libro" sections={['/history']} />
            <NavItem to="/shifts" icon={<CalendarDotsIcon />} label="Turnos" />
            <NavItem to="/audit" icon={<ClockCounterClockwiseIcon />} label="Bitácora" />
            <NavItem
              to="/more"
              icon={<DotsThreeOutlineIcon />}
              label="Más"
              sections={['/accounts', '/tools', '/admin', '/account']}
            />
          </div>
        </nav>
      )}
    </div>
  );
}
