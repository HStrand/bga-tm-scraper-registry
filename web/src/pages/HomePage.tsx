import { useEffect, useMemo, useRef, useState } from "react";
import { getStatistics, Statistics } from "@/lib/stats";
import { Users, Database, Download, Gauge, LineChart, BarChart3 } from "lucide-react";

function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}

function BigStat({
  title,
  icon,
  value,
  hint,
}: {
  title: string;
  icon: React.ReactNode;
  value: string;
  hint?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm p-5 shadow-sm">
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-amber-500/10 blur-2xl" />
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 border border-amber-100/70 dark:border-amber-800">
          {icon}
        </div>
        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </div>
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  );
}

function CoverageDonut({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent));
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - p / 100);

  return (
    <div className="relative flex items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
        <circle
          cx="70"
          cy="70"
          r={radius}
          stroke="currentColor"
          strokeWidth="12"
          className="text-slate-200 dark:text-slate-700"
          fill="none"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          stroke="url(#grad)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          fill="none"
        />
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute rotate-90 text-center">
        <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          {p.toFixed(0)}%
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Coverage</div>
      </div>
    </div>
  );
}

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

  const totalGames = stats?.totalIndexedGames ?? 0;
  const scrapedGames = stats?.scrapedGamesTotal ?? 0;
  const coverage = useMemo(() => {
    if (!totalGames) return 0;
    return Math.max(0, Math.min(100, (scrapedGames / totalGames) * 100));
  }, [totalGames, scrapedGames]);

  const playersAnim = useCountUp(stats?.totalPlayers ?? 0);
  const totalGamesAnim = useCountUp(totalGames);
  const scrapedAnim = useCountUp(scrapedGames);

  return (
    <div className="space-y-10">
      {/* Hero with gradient, glow and pattern */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 p-8 shadow-sm">
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-rose-400/20 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04] dark:opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "18px 18px",
            color: "#0f172a",
          }}
        />
        <div className="relative">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Terraforming Mars Statistics
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-400 text-lg">
            Explore performance insights across corporations, project cards, and preludes.
          </p>
        </div>

        {/* Coverage callout */}
        <div className="relative mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div className="md:col-span-2">
            <div className="rounded-2xl border border-amber-200/60 dark:border-amber-800/50 bg-white/70 dark:bg-slate-900/50 backdrop-blur p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Dataset Coverage
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    {scrapedAnim.toLocaleString()} / {totalGamesAnim.toLocaleString()} games scraped
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-rose-500"
                      style={{ width: `${coverage}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {coverage.toFixed(1)}% coverage
                  </div>
                </div>
                <div className="hidden sm:block">
                  <CoverageDonut percent={coverage} />
                </div>
              </div>
            </div>
          </div>

          {/* Quick highlights */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/70 backdrop-blur p-5">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <LineChart className="w-5 h-5 text-amber-600 dark:text-amber-300" />
              <div className="text-sm font-semibold">Highlights</div>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>Players indexed: <span className="font-medium text-slate-900 dark:text-slate-100">{playersAnim.toLocaleString()}</span></li>
              <li>Avg Elo (scraped): <span className="font-medium text-slate-900 dark:text-slate-100">{stats?.averageEloInScrapedGames != null ? Math.round(stats.averageEloInScrapedGames) : "N/A"}</span></li>
              <li>Median Elo (scraped): <span className="font-medium text-slate-900 dark:text-slate-100">{stats?.medianEloInScrapedGames != null ? Math.round(stats.medianEloInScrapedGames) : "N/A"}</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* KPI Grid */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Dataset Overview</h2>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-28 bg-white/70 dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-300 dark:border-red-700 bg-red-50/80 dark:bg-red-900/30 p-6">
            <p className="text-red-700 dark:text-red-200">{error}</p>
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            <BigStat
              title="Players"
              icon={<Users className="w-5 h-5" />}
              value={playersAnim.toLocaleString()}
            />
            <BigStat
              title="Total Games"
              icon={<Database className="w-5 h-5" />}
              value={totalGamesAnim.toLocaleString()}
            />
            <BigStat
              title="Scraped Games"
              icon={<Download className="w-5 h-5" />}
              value={scrapedAnim.toLocaleString()}
              hint={`${coverage.toFixed(1)}% coverage`}
            />
            <BigStat
              title="Avg Elo (scraped)"
              icon={<BarChart3 className="w-5 h-5" />}
              value={
                stats.averageEloInScrapedGames != null
                  ? Math.round(stats.averageEloInScrapedGames).toLocaleString()
                  : "N/A"
              }
            />
            <BigStat
              title="Median Elo (scraped)"
              icon={<Gauge className="w-5 h-5" />}
              value={
                stats.medianEloInScrapedGames != null
                  ? Math.round(stats.medianEloInScrapedGames).toLocaleString()
                  : "N/A"
              }
            />
            {/* Empty card for balance / future content */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-5">
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-rose-500/10 blur-2xl" />
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Tips
              </div>
              <div className="mt-2 text-slate-700 dark:text-slate-200 text-sm">
                Use the left menu to dive into Corporations, Project Cards, or Preludes. Apply filters on those pages to explore subsets of the dataset.
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
