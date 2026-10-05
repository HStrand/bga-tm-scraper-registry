import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Layers, ListOrdered, Play, Swords } from "lucide-react";
import { parseTableId } from "@/lib/tableId";

const EXAMPLE_TABLE_ID = "824655675";

const FEATURES = [
  {
    icon: ListOrdered,
    title: "Every move, in order",
    text: "Step forward and back through the game and watch the board, the global parameters and the scores change.",
  },
  {
    icon: Layers,
    title: "Hands and tableaus",
    text: "See what each player had in hand and in play at any point, along with their resources and production.",
  },
  {
    icon: Swords,
    title: "Play on from a position",
    text: "In two-player games you can take over at the start of a turn and play it out differently.",
  },
];

export function ReplayLandingPage() {
  const [input, setInput] = useState("");
  const [showError, setShowError] = useState(false);
  const navigate = useNavigate();

  const tableId = parseTableId(input);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tableId) navigate(`/replay/${tableId}`);
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
          A game that isn't in the database yet can be fetched from BGA in about 20 seconds.{" "}
          <Link
            to={`/replay/${EXAMPLE_TABLE_ID}`}
            className="font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
          >
            Open an example game
          </Link>
        </p>
      </form>

      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-2xl border border-slate-200 bg-white/60 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <Icon className="h-5 w-5 text-amber-600 dark:text-amber-300" />
            <h2 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
