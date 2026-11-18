import { useState } from 'react';

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // Storage blocked (private mode, site data off): nothing remembered.
  }
};

const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Same: the choice holds until the page is closed.
  }
};

/**
 * A choice remembered on this device only, such as the book's order. It never reaches the
 * server, and the screen works the same when the browser does not let it be stored.
 */
export function useLocalPreference<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = read(key);
    return allowed.includes(stored as T) ? (stored as T) : fallback;
  });
  const update = (next: T) => {
    setValue(next);
    write(key, next);
  };
  return [value, update];
}
