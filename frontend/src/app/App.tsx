import { SystemStatusCard } from '@/features/system-status/SystemStatusCard';

export function App() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="mb-6">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">
          Edificio Correspondencia 63
        </p>
        <h1 className="font-heading text-2xl font-bold">DepAdmin</h1>
      </header>

      <main className="flex flex-1 flex-col gap-4">
        <SystemStatusCard />
      </main>

      <footer className="mt-6 text-center text-xs text-muted-foreground">
        Administración de cuotas de mantenimiento
      </footer>
    </div>
  );
}
