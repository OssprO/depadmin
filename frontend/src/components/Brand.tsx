/** The building and app name, as shown on the login screen and atop every page. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <p
        className={
          compact
            ? 'text-[0.6rem] tracking-wider text-muted-foreground uppercase'
            : 'text-xs tracking-widest text-muted-foreground uppercase'
        }
      >
        Edificio Correspondencia 63
      </p>
      <p className="font-heading text-2xl font-bold">DepAdmin</p>
    </div>
  );
}
