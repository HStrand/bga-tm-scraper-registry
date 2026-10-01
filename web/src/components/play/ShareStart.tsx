import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { startLinkPath, type StartingPosition } from '@/lib/engine/startLink';

/**
 * Copies a link that deals a fresh game from the position this game started from. The page's own address
 * is this very game, so passing that on shares the moves already made rather than the starting position.
 */
export function ShareStart({ start }: { start: StartingPosition }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${startLinkPath(start)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // No clipboard access (an insecure origin, a refused permission): show the link to copy by hand.
      window.prompt('Copy this link to share the starting position', link);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy a link that deals a fresh game from this starting position, with the same cards in the same order. Everyone who opens it gets a game of their own."
      className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-amber-400 hover:text-amber-300"
    >
      <Share2 size={14} />
      <span>{copied ? 'Link copied' : 'Share starting position'}</span>
    </button>
  );
}
