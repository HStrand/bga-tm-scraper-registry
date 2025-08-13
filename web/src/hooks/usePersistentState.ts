import { useEffect, useRef, useState } from 'react';

type Options = {
  debounceMs?: number;
};

type Meta = {
  hasStoredValue: boolean;
};

/**
 * Persist a piece of state to localStorage.
 * - Reads once on mount and seeds state from storage if present.
 * - Writes on changes with debounce (default 200ms).
 * - Provides a reset() that clears storage and resets to the provided initialState.
 * - Returns meta.hasStoredValue to indicate whether a value existed in storage on init.
 *
 * Notes:
 * - Versioning should be handled by changing the storage key (e.g., appending :v2).
 * - initialState is used when no stored value exists or parsing fails.
 */
export function usePersistentState<T>(
  key: string,
  initialState: T,
  options?: Options
): [T, React.Dispatch<React.SetStateAction<T>>, () => void, Meta] {
  const debounceMs = options?.debounceMs ?? 200;

  // Read once to determine initial value and whether storage had a value
  let storedValue: T | undefined;
  let hadStoredValue = false;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        storedValue = JSON.parse(raw) as T;
        hadStoredValue = true;
      }
    } catch {
      // ignore parse errors and fall back to initialState
    }
  }

  const [state, setState] = useState<T>(storedValue ?? initialState);
  const hasStoredValueRef = useRef<boolean>(hadStoredValue);
  const timeoutRef = useRef<number | null>(null);

  // Persist changes with debounce
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    timeoutRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // ignore write errors (e.g., storage quota)
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [key, state, debounceMs]);

  const reset = () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore storage errors
      }
    }
    setState(initialState);
    hasStoredValueRef.current = false;
  };

  return [state, setState, reset, { hasStoredValue: hasStoredValueRef.current }];
}
