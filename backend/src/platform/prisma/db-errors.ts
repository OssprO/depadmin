/**
 * The name of the database constraint an error violated (unique, exclusion or check), or
 * null if it is not such an error. Prisma reports it through the driver adapter's cause.
 */
export function violatedConstraint(error: unknown): string | null {
  const cause = (
    error as { meta?: { driverAdapterError?: { cause?: { originalMessage?: unknown } } } }
  )?.meta?.driverAdapterError?.cause;
  const message = typeof cause?.originalMessage === 'string' ? cause.originalMessage : '';
  return /constraint "([^"]+)"/.exec(message)?.[1] ?? null;
}

/**
 * Runs a write and turns the violation of a known constraint into the domain error it
 * stands for. The domain checks first; the constraint only fires when two requests pass
 * that check at the same time, and then the loser gets the same 409 as if it had come later.
 */
export async function translateViolations<T>(
  work: () => Promise<T>,
  translations: Readonly<Record<string, () => Error>>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const constraint = violatedConstraint(error);
    const translate = constraint ? translations[constraint] : undefined;
    throw translate ? translate() : error;
  }
}
