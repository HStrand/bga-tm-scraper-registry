/**
 * The BGA table id in what someone typed or pasted: the bare number, or any Board Game Arena
 * link that carries it (table?table=…, gamereview?table=…, archive/replay/…?table=…).
 * Null when there is no table id in it.
 */
export function parseTableId(input: string): string | null {
  const text = input.trim();
  if (/^\d{6,12}$/.test(text)) return text;
  const fromLink = text.match(/[?&#]table=(\d{6,12})(?!\d)/i);
  if (fromLink) return fromLink[1];
  // A number typed with spaces or separators, or with a leading #
  const digits = text.replace(/^#/, '').replace(/[\s.,]/g, '');
  return /^\d{6,12}$/.test(digits) ? digits : null;
}
