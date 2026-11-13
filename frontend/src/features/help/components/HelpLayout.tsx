import { CaretLeftIcon } from '@phosphor-icons/react';
import {
  Outlet,
  useCanGoBack,
  useNavigate,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/button';

/**
 * The help's own shell: it is public, so whoever cannot sign in can read it too, and it
 * lives outside the signed-in layout. «Atrás» returns to the previous screen, or up from a
 * topic to the list, and from the list to the app (the login, without a session).
 */
export function HelpLayout() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col">
      <header className="flex flex-col gap-2 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4 md:px-8 print:hidden">
        <Brand />
        <BackButton />
      </header>
      <main className="flex flex-1 flex-col gap-6 px-4 pb-10 text-base/relaxed md:px-8 print:px-0">
        <Outlet />
      </main>
    </div>
  );
}

function BackButton() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const parent = pathname.replace(/\/+$/, '') === '/help' ? '/' : '/help';
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
