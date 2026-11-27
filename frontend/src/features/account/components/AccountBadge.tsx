import type { CurrentUser, Role } from '@depadmin/shared';
import { WrenchIcon } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';
import { accountName, ROLES, userLabel } from '@/lib/user-label';
import { cn } from '@/lib/utils';

type Account = Pick<CurrentUser, 'role' | 'unit' | 'username'>;

// Told apart by what the circle holds and by its outline, not by color alone (WCAG 1.4.1):
// a number on a light disc, the wrench on a dark one, an initial in a dashed ring.
const CIRCLE: Record<Role, string> = {
  OWNER: 'border border-border bg-secondary text-secondary-foreground',
  SUPERADMIN: 'bg-primary text-primary-foreground',
  READER: 'border border-dashed border-muted-foreground text-foreground',
};

function AccountCircle({ user }: { user: Account }) {
  return (
    <span
      aria-hidden
      data-slot="account-circle"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
        CIRCLE[user.role],
      )}
    >
      {user.role === 'SUPERADMIN' ? (
        <WrenchIcon className="size-5" weight="bold" />
      ) : user.role === 'OWNER' ? (
        user.unit
      ) : (
        user.username.charAt(0).toUpperCase()
      )}
    </span>
  );
}

interface AccountBadgeProps {
  readonly user: Account;
  /** The account's name and role beside the circle, where there is room (the side menu). */
  readonly withText?: boolean;
  /** Opens _Mi cuenta_; off while a temporary password leaves nowhere else to go. */
  readonly link?: boolean;
  readonly className?: string;
}

/**
 * Who is signed in, on every screen (phase 37): the administrator is 501 and also the
 * superadmin, and what they do is logged under the account they used.
 */
export function AccountBadge({
  user,
  withText = false,
  link = true,
  className,
}: AccountBadgeProps) {
  const content = (
    <>
      <span className="sr-only">{accountName(user)}</span>
      <AccountCircle user={user} />
      {withText && (
        <span aria-hidden className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{userLabel(user)}</span>
          <span className="truncate text-xs text-muted-foreground">{ROLES[user.role]}</span>
        </span>
      )}
    </>
  );
  const classes = cn('flex min-w-0 items-center gap-3', className);
  return link ? (
    <Link to="/account" data-slot="account-badge" className={classes}>
      {content}
    </Link>
  ) : (
    <div data-slot="account-badge" className={classes}>
      {content}
    </div>
  );
}
