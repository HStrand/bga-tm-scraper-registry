import { Link } from 'react-router-dom';
import { ArrowLeft, CloudDownload, RefreshCw } from 'lucide-react';

interface ReplayNotFoundProps {
  tableId: string | undefined;
  dailyLimitReached: boolean;
  scraping: boolean;
  scrapeError: string | null;
  onFetch: () => void;
}

/** Shown in place of a replay when the table has no stored game log: offers to fetch it from BGA. */
export function ReplayNotFound({ tableId, dailyLimitReached, scraping, scrapeError, onFetch }: ReplayNotFoundProps) {
  const validId = !!tableId && /^\d{6,12}$/.test(tableId);

  return (
    <div className="mx-auto mt-[12vh] max-w-lg">
      <div className="play-panel p-6 md:p-8">
        <p className="play-heading">Table {tableId}</p>

        {!validId ? (
          <>
            <h1 className="mt-2 text-xl font-bold text-white">That isn't a table ID</h1>
            <p className="mt-2 text-sm text-slate-400">
              A table ID is a number of 6 to 12 digits, found at the end of the game's address on Board Game Arena.
            </p>
          </>
        ) : dailyLimitReached ? (
          <>
            <h1 className="mt-2 text-xl font-bold text-white">This game isn't in the database yet</h1>
            <p className="mt-2 text-sm text-amber-300">
              New games can't be fetched right now: today's limit on replays from Board Game Arena has been reached. Try
              again tomorrow.
            </p>
          </>
        ) : scraping ? (
          <>
            <h1 className="mt-2 flex items-center gap-2.5 text-xl font-bold text-white">
              <RefreshCw size={18} className="animate-spin text-amber-400" />
              Fetching this game from Board Game Arena
            </h1>
            <p role="status" className="mt-2 text-sm text-slate-400">
              It isn't in the database yet. This takes about 20 seconds, and the replay opens when it is done.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-xl font-bold text-white">This game isn't in the database yet</h1>
            {scrapeError ? (
              <p role="alert" className="mt-2 text-sm text-red-400">{scrapeError}</p>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                It can be fetched from Board Game Arena now. That takes about 20 seconds, and the replay opens when it
                is done.
              </p>
            )}
            <button
              onClick={onFetch}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
            >
              <CloudDownload size={16} />
              {scrapeError ? 'Try again' : 'Fetch this game'}
            </button>
          </>
        )}

        <div className="mt-6 border-t border-slate-700/50 pt-4">
          <Link
            to="/replay"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-slate-200"
          >
            <ArrowLeft size={14} />
            Open a different game
          </Link>
        </div>
      </div>
    </div>
  );
}
