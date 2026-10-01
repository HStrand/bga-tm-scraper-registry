// Which build of the site a tab is running, and which one is deployed. Every build has its own hashed
// entry script (assets/index-<hash>.js), which index.html names, so the script's name identifies the build.

/** The entry script named in a page's HTML or a script URL, or null when there is none (the dev server). */
export function bundleIn(html: string): string | null {
  return html.match(/assets\/index-[\w-]+\.js/)?.[0] ?? null;
}

/** The build this tab loaded. */
export function loadedBundle(doc: Document = document): string | null {
  const scripts = Array.from(doc.querySelectorAll('script[src]'));
  return scripts.map(s => bundleIn(s.getAttribute('src') ?? '')).find(Boolean) ?? null;
}

/** The build the site serves now, or null when that cannot be found out. */
export async function deployedBundle(): Promise<string | null> {
  try {
    const response = await fetch('/index.html', { cache: 'no-store' });
    return response.ok ? bundleIn(await response.text()) : null;
  } catch {
    return null;
  }
}
