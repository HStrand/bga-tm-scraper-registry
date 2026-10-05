import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Play } from "lucide-react";
import { parseTableId } from "@/lib/tableId";

const EXAMPLE_TABLE_ID = "824655675";

export function ReplayLandingPage() {
  const [input, setInput] = useState("");
  const [showError, setShowError] = useState(false);
  const navigate = useNavigate();

  const tableId = parseTableId(input);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Opening a game from here fetches it from BGA when it is not stored yet.
    if (tableId) navigate(`/replay/${tableId}`, { state: { fetchIfMissing: true } });
    else setShowError(true);
  }

  return (
    <div className="mx-auto max-w-3xl pt-4 md:pt-10">
      <div className="flex items-center gap-4">
        <div className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-amber-100/70 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <Play className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 md:text-3xl">Replay Viewer</h1>
          <p className="mt-0.5 text-slate-600 dark:text-slate-400">
            Watch any Terraforming Mars game from Board Game Arena, move by move.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 md:p-6"
      >
        <label htmlFor="table-id" className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
          Table ID or game link
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="table-id"
            type="text"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowError(false);
            }}
            placeholder="926358228"
            aria-invalid={showError && !tableId}
            aria-describedby="table-id-help"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-lg text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
          >
            Open replay
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {showError && !tableId ? (
          <p id="table-id-help" role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {input.trim()
              ? "That doesn't contain a table ID. It is a number of 6 to 12 digits."
              : "Enter a table ID or paste a link to the game."}
          </p>
        ) : (
          <p id="table-id-help" className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            The number at the end of the game's address on BGA, as in{" "}
            <span className="break-all font-mono text-slate-700 dark:text-slate-300">
              boardgamearena.com/table?table=<span className="font-semibold text-amber-700 dark:text-amber-300">926358228</span>
            </span>
            . You can paste the whole link.
          </p>
        )}

        <p className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          A game that isn't in the database yet is fetched from BGA first, which takes about 20 seconds.{" "}
          <Link
            to={`/replay/${EXAMPLE_TABLE_ID}`}
            className="whitespace-nowrap font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
          >
            Open an example game
          </Link>
        </p>
      </form>
    </div>
  );
}
