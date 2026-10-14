import {
  BookOpenTextIcon,
  CalendarDotsIcon,
  ClockCounterClockwiseIcon,
  DotsThreeOutlineIcon,
  HouseIcon,
} from '@phosphor-icons/react';
import { Link, type LinkProps, Outlet, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Brand } from '@/components/Brand';
import { useCurrentUser } from '@/lib/use-session';

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

/** The signed-in shell: content on top, thumb-reachable navigation at the bottom. */
export function AppLayout() {
  const user = useCurrentUser();
  // A user with a temporary password can only change it; there is nowhere else to go.
  const showNav = !user.mustChangePassword;

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col">
      <header className="px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4">
        <Brand />
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
            <NavItem to="/book" icon={<BookOpenTextIcon />} label="Libro" />
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
