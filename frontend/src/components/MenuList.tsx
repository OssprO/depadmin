import { CaretRightIcon } from '@phosphor-icons/react';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface MenuEntryProps {
  readonly to: NonNullable<LinkProps['to']>;
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
}

export function MenuEntry({ to, icon, title, description }: MenuEntryProps) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 py-3 [&>svg]:size-6">
        {icon}
        <span className="flex flex-1 flex-col">
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground">{description}</span>
        </span>
        <CaretRightIcon className="text-muted-foreground" />
      </Link>
    </li>
  );
}

/** A card of links to other screens, one per row. */
export function MenuList({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent>
        <ul className="divide-y">{children}</ul>
      </CardContent>
    </Card>
  );
}
