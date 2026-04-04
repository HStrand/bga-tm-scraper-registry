import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";

export function ReplayLandingPage() {
  const [tableId, setTableId] = useState("");
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = tableId.trim();
    if (trimmed) navigate(`/replay/${trimmed}`);
  }

  return (
    <div className="max-w-xl mx-auto mt-12">
      <h1 className="text-2xl font-bold mb-4">Game Replay Viewer</h1>

      <p className="text-gray-600 mb-2">
        Watch a full replay of any Terraforming Mars game from Board Game Arena.
        Enter the table ID to view the game step by step, including tile
        placements, card plays, and resource changes.
      </p>
      <p className="text-gray-500 mb-6 text-sm">
        You can find the table ID in the BGA game URL — it's the number at the
        end (e.g.&nbsp;
        <span className="font-mono text-gray-700">
          boardgamearena.com/table?table=<strong>123456789</strong>
        </span>
        ).
      </p>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          inputMode="numeric"
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          placeholder="Table ID, e.g. 123456789"
          className="flex-1 rounded-lg bg-white border border-gray-300 px-4 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={!tableId.trim()}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Play size={16} />
          Watch
        </button>
      </form>
    </div>
  );
}
