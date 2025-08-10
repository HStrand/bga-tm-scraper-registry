import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
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

// Optional Functions key support via env (if your functions require a key)
const FUNCTIONS_KEY = import.meta.env.VITE_FUNCTIONS_KEY as string | undefined;

export default function HomePage() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

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

  const playersAnim = useCountUp(stats?.totalPlayers ?? 0);
  const totalGamesAnim = useCountUp(totalGames);
  const scrapedAnim = useCountUp(scrapedGames);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const headers: Record<string, string> = {};
      if (FUNCTIONS_KEY) headers["x-functions-key"] = FUNCTIONS_KEY;
      const res = await axios.get("/api/DownloadLatestZip", {
        responseType: "blob",
        headers,
      });
      // Try to extract filename from Content-Disposition
      let filename = "bga-tm-dataset.zip";
      const cd = res.headers["content-disposition"];
      if (cd) {
        const match = /filename="?([^"]+)"?/i.exec(cd);
        if (match?.[1]) filename = match[1];
      }
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed", e);
      alert("Failed to start download. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

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

        <div className="relative flex flex-col gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Terraforming Mars Statistics
            </h1>
            <p className="mt-3 text-slate-600 dark:text-slate-400 text-lg">
              Explore performance insights across corporations, project cards, and preludes.
            </p>
          </div>

          {/* Quick stats row (indexed / scraped) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 backdrop-blur p-5">
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
                <Database className="w-5 h-5 text-amber-600 dark:text-amber-300" />
                <div className="text-sm font-semibold">Indexed Games</div>
              </div>
              <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
                {totalGamesAnim.toLocaleString()}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 backdrop-blur p-5">
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
                <Download className="w-5 h-5 text-amber-600 dark:text-amber-300" />
                <div className="text-sm font-semibold">Scraped Games</div>
              </div>
              <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
                {scrapedAnim.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Download CTA */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-70 text-white px-4 py-2.5 shadow-sm"
            >
              <Download className="w-4 h-4" />
              {downloading ? "Preparing download..." : "Download Full Dataset (.zip)"}
            </button>
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Latest zipped archive of all scraped data
            </span>
          </div>
        </div>
      </section>

      {/* KPI Grid */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Dataset Overview</h2>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array.from({ length: 5 }).map((_, i) => (
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
          </div>
        ) : null}
      </section>
    </div>
  );
}
