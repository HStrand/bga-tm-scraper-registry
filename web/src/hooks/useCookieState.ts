import { useEffect, useRef, useState } from 'react';

type Options = {
  debounceMs?: number;
  // Days to persist cookie (default 365)
  days?: number;
};

type Meta = {
  hasStoredValue: boolean;
};

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  for (const c of cookies) {
    const [k, ...rest] = c.split('=');
    if (k === name) {
      return rest.join('=');
    }
  }
  return undefined;
}

function setCookie(name: string, value: string, days: number) {
  if (typeof document === 'undefined') return;
  const maxAge = Math.max(0, Math.floor(days * 24 * 60 * 60));
  const attributes = [
    `path=/`,
    `max-age=${maxAge}`,
    // SameSite for reasonable defaults; Secure only on https to avoid issues in dev
    `samesite=lax`,
  ];
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:') {
    attributes.push('secure');
  }
  document.cookie = `${name}=${value}; ${attributes.join('; ')}`;
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

export function useCookieState<T>(
  name: string,
  initialState: T,
  options?: Options
): [T, React.Dispatch<React.SetStateAction<T>>, () => void, Meta] {
  const debounceMs = options?.debounceMs ?? 200;
  const days = options?.days ?? 365;

  // Initialize from cookie once
  let stored: T | undefined;
  let hadStoredValue = false;
  if (typeof document !== 'undefined') {
    try {
      const raw = getCookie(name);
      if (raw != null) {
        const decoded = decodeURIComponent(raw);
        stored = JSON.parse(decoded) as T;
        hadStoredValue = true;
      }
    } catch {
      // ignore parse errors, fall back to initialState
    }
  }

  const [state, setState] = useState<T>(stored ?? initialState);
  const hasStoredValueRef = useRef<boolean>(hadStoredValue);
  const timeoutRef = useRef<number | null>(null);

  // Persist changes to cookie with debounce
  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    timeoutRef.current = window.setTimeout(() => {
      try {
        const encoded = encodeURIComponent(JSON.stringify(state));
        setCookie(name, encoded, days);
      } catch {
        // ignore write errors
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [name, state, days, debounceMs]);

  const reset = () => {
    if (typeof document !== 'undefined') {
      try {
        deleteCookie(name);
      } catch {
        // ignore cookie deletion errors
      }
    }
    setState(initialState);
    hasStoredValueRef.current = false;
  };

  return [state, setState, reset, { hasStoredValue: hasStoredValueRef.current }];
}
