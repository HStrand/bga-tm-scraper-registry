import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { deployedBundle, loadedBundle } from '@/lib/appVersion';

/** How long a check stays good for, so that clicking around does not fetch index.html every time. */
const CHECK_INTERVAL_MS = 60_000;

interface VersionWatcherProps {
  /** The build this tab is running; null on the dev server, where there is nothing to compare. */
  current?: string | null;
  check?: () => Promise<string | null>;
  reload?: () => void;
}

/**
 * Reloads the page on moving to another page when a newer build has been deployed. A single-page app
 * otherwise keeps running the build its tab started with for as long as the tab stays open, since moving
 * between pages never fetches index.html again. The address has already changed by then, so the reload
 * lands on the page the visitor was going to.
 */
export function VersionWatcher({ current = loadedBundle(), check = deployedBundle, reload = () => window.location.reload() }: VersionWatcherProps) {
  const { pathname } = useLocation();
  const shownPath = useRef(pathname);
  const lastChecked = useRef(0);
  const actions = useRef({ check, reload });
  actions.current = { check, reload };

  useEffect(() => {
    // Only a move to another page counts: not the page the tab opened on, which was just loaded, and not
    // a change of query string, which the replay viewer makes on every step.
    if (!current || pathname === shownPath.current) return;
    shownPath.current = pathname;

    if (Date.now() - lastChecked.current < CHECK_INTERVAL_MS) return;
    lastChecked.current = Date.now();

    void actions.current.check().then(deployed => {
      if (deployed && deployed !== current) actions.current.reload();
    });
  }, [pathname, current]);

  return null;
}
