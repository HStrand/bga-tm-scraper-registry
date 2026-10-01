import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter } from 'react-router-dom';
import { VersionWatcher } from '@/components/VersionWatcher';
import { bundleIn, loadedBundle } from '@/lib/appVersion';

const RUNNING = 'assets/index-AAAA1111.js';
const NEWER = 'assets/index-BBBB2222.js';

function renderSite(deployed: string | null, current: string | null = RUNNING) {
  const check = vi.fn(async () => deployed);
  const reload = vi.fn();
  render(
    <MemoryRouter initialEntries={['/corporations']}>
      <VersionWatcher current={current} check={check} reload={reload} />
      <Link to="/cards">Cards</Link>
      <Link to="/preludes">Preludes</Link>
      <Link to="/corporations?sort=elo">Sort</Link>
    </MemoryRouter>,
  );
  return { check, reload, user: userEvent.setup() };
}

describe('VersionWatcher', () => {
  it('reloads on moving to another page once a newer build is deployed', async () => {
    const { check, reload, user } = renderSite(NEWER);

    // The page the tab opened on was just loaded; there is nothing to check yet.
    expect(check).not.toHaveBeenCalled();

    await user.click(screen.getByRole('link', { name: 'Cards' }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('leaves the page alone while the deployed build is the one running', async () => {
    const { check, reload, user } = renderSite(RUNNING);

    await user.click(screen.getByRole('link', { name: 'Cards' }));

    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload when the deployed build cannot be found out', async () => {
    const { check, reload, user } = renderSite(null);

    await user.click(screen.getByRole('link', { name: 'Cards' }));

    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not check on a change of query string, nor again within a minute', async () => {
    const { check, user } = renderSite(RUNNING);

    await user.click(screen.getByRole('link', { name: 'Sort' }));
    expect(check).not.toHaveBeenCalled();

    await user.click(screen.getByRole('link', { name: 'Cards' }));
    await user.click(screen.getByRole('link', { name: 'Preludes' }));
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('does nothing on the dev server, where no build is running', async () => {
    const { check, user } = renderSite(NEWER, null);

    await user.click(screen.getByRole('link', { name: 'Cards' }));

    expect(check).not.toHaveBeenCalled();
  });
});

describe('bundleIn', () => {
  it('finds the hashed entry script in a built index.html', () => {
    const html = '<script type="module" crossorigin src="/assets/index-Bdg5BoDa.js"></script><link rel="stylesheet" href="/assets/index-wbmBxpkp.css">';

    expect(bundleIn(html)).toBe('assets/index-Bdg5BoDa.js');
  });

  it('finds none in the dev server page', () => {
    expect(bundleIn('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
  });
});

describe('loadedBundle', () => {
  it('reads the build from the entry script of the page', () => {
    const doc = document.implementation.createHTMLDocument();
    doc.head.innerHTML = '<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><script type="module" src="/assets/index-Bdg5BoDa.js"></script>';

    expect(loadedBundle(doc)).toBe('assets/index-Bdg5BoDa.js');
    expect(loadedBundle(document.implementation.createHTMLDocument())).toBeNull();
  });
});
