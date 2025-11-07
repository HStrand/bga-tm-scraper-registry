import { useEffect, useState } from 'react';

/**
 * Returns a debounced version of a value that only updates after `delayMs` of no changes.
 * Useful to throttle network requests triggered by rapidly changing inputs (e.g., filters).
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
