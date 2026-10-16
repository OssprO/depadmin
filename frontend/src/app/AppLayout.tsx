import {
  BookOpenTextIcon,
  CaretLeftIcon,
  CalendarDotsIcon,
  ClockCounterClockwiseIcon,
  DotsThreeOutlineIcon,
  HouseIcon,
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
import { buildingToday } from '@/lib/format';
import { useCurrentUser } from '@/lib/use-session';
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

/**
 * "Atrás" on every screen the bottom bar does not open: back to the previous screen of the
 * app, or up to the one that lists this one when the page was opened directly.
 */
function BackButton() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const parent = parentOf(pathname, buildingToday().slice(0, 7));
  if (!parent) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 self-start"
      onClick={() => {
        if (canGoBack) router.history.back();
        else void navigate({ to: parent });
      }}
    >
      <CaretLeftIcon /> Atrás
    </Button>
  );
}

/** The signed-in shell: content on top, thumb-reachable navigation at the bottom. */
export function AppLayout() {
  const user = useCurrentUser();
  // A user with a temporary password can only change it; there is nowhere else to go.
  const showNav = !user.mustChangePassword;

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col">
      <header className="flex flex-col gap-2 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4">
        <Brand />
        {showNav && <BackButton />}
      </header>
      <main className={`flex flex-1 flex-col gap-4 px-4 ${showNav ? 'pb-24' : 'pb-6'}`}>
        <Outlet />
      </main>
      {showNav && (
        <nav
          aria-label="Principal"
          className="fixed inset-x-0 bottom-0 border-t bg-background pb-[env(safe-area-inset-bottom)]"
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
              sections={['/accounts', '/admin', '/account']}
            />
          </div>
        </nav>
      )}
    </div>
  );
}
