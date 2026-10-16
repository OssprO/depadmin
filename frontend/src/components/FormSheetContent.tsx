import type { ComponentProps } from 'react';
import { SheetContent } from '@/components/ui/sheet';
import { useWideScreen } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

/**
 * Where a form opens: from the bottom on the phone, within reach of the thumb; as a panel on
 * the right from a tablet up, so the screen behind stays in view.
 */
export function FormSheetContent({
  className,
  ...props
}: Omit<ComponentProps<typeof SheetContent>, 'side'>) {
  const wide = useWideScreen();
  return (
    <SheetContent
      side={wide ? 'right' : 'bottom'}
      className={cn(
        'overflow-y-auto',
        wide ? 'w-full sm:max-w-md' : 'mx-auto max-h-[90svh] max-w-md',
        className,
      )}
      {...props}
    />
  );
}
