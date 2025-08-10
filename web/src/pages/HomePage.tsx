import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getStatistics, Statistics } from "@/lib/stats";

export default function HomePage() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getStatistics();
        if (!cancelled) setStats(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Failed to load statistics. Please try again later.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-6 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Terraforming Mars Statistics</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Dataset overview and navigation to corporations, project cards, and preludes analytics.
        </p>
      </section>

      {/* Statistics */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Dataset Overview</h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-24 bg-white/80 dark:bg-slate-800/70 rounded-xl border border-zinc-200 dark:border-slate-700 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="bg-white/90 dark:bg-slate-800/80 rounded-xl border border-zinc-200 dark:border-slate-700 p-6">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <StatCard title="Players" value={stats.totalPlayers.toLocaleString()} />
            <StatCard title="Total Games" value={stats.totalIndexedGames.toLocaleString()} />
            <StatCard title="Scraped Games" value={stats.scrapedGamesTotal.toLocaleString()} />
            <StatCard
              title="Avg Elo (scraped)"
              value={
                stats.averageEloInScrapedGames != null
                  ? Math.round(stats.averageEloInScrapedGames).toLocaleString()
                  : "N/A"
              }
            />
            <StatCard
              title="Median Elo (scraped)"
              value={
                stats.medianEloInScrapedGames != null
                  ? Math.round(stats.medianEloInScrapedGames).toLocaleString()
                  : "N/A"
              }
            />
          </div>
        ) : null}
      </section>

      {/* Quick navigation */}
      <section className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Overview Pages</h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/corporations">Corporations Overview</Link>
          </Button>
          <Button asChild>
            <Link to="/cards">Project Cards Overview</Link>
          </Button>
          <Button asChild>
            <Link to="/preludes">Preludes Overview</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}
