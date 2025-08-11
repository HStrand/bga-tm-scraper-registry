import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
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
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(Math.round(target * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
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

type ZipInfo = {
  fileName: string;
  sizeInBytes: number;
  sizeFormatted: string;
} | null;

function humanBytes(n: number | undefined) {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let num = n;
  while (num >= 1024 && i < units.length - 1) {
    num /= 1024;
    i++;
  }
  return `${num.toFixed(1)} ${units[i]}`;
}

export default function HomePage() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [zipInfo, setZipInfo] = useState<ZipInfo>(null);
  const [zipInfoLoading, setZipInfoLoading] = useState(false);

  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null); // 0..1 or null
  const [downloadText, setDownloadText] = useState<string>("");

  const [toast, setToast] = useState<string | null>(null);

  // Fetch statistics
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

  // Fetch latest zip size & name
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setZipInfoLoading(true);
        const res = await api.get("/api/GetLatestZipSize");
        const raw = res.data || {};
        if (!cancelled && raw.success) {
          setZipInfo({
            fileName: raw.fileName,
            sizeInBytes: raw.sizeInBytes ?? 0,
            sizeFormatted: raw.sizeFormatted ?? humanBytes(raw.sizeInBytes),
          });
        }
      } catch (e) {
        console.warn("Could not fetch latest zip size", e);
      } finally {
        if (!cancelled) setZipInfoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Toast helper
  const showToast = (msg: string, ttl = 3500) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), ttl);
  };

  const totalGames = stats?.totalIndexedGames ?? 0;
  const scrapedGames = stats?.scrapedGamesTotal ?? 0;

  const playersAnim = useCountUp(stats?.totalPlayers ?? 0);
  const totalGamesAnim = useCountUp(totalGames);
  const scrapedAnim = useCountUp(scrapedGames);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setDownloadProgress(null);
      setDownloadText("Contacting server…");

      const totalBytes = zipInfo?.sizeInBytes ?? 0;

      const res = await api.get("/api/DownloadLatestZip", {
        responseType: "blob",
        onDownloadProgress: (evt) => {
          // evt.total may be 0 depending on server/browser; fallback to known size
          const loaded = evt.loaded ?? 0;
          const total = evt.total && evt.total > 0 ? evt.total : totalBytes;
          if (total > 0) {
            const pct = Math.min(1, loaded / total);
            setDownloadProgress(pct);
            setDownloadText(`${humanBytes(loaded)} / ${humanBytes(total)}`);
          } else {
            // Indeterminate
            setDownloadProgress(null);
            setDownloadText("Downloading…");
          }
        },
      });

      // Try to extract filename from Content-Disposition
      let filename = zipInfo?.fileName || "bga-tm-dataset.zip";
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

      showToast(`Download started: ${filename}`);
      setDownloadText("");
      setDownloadProgress(null);
    } catch (e) {
      console.error("Download failed", e);
      setDownloadText("");
      setDownloadProgress(null);
      showToast("Failed to download dataset. Please try again.", 5000);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[70]">
          <div className="rounded-lg bg-slate-900 text-white px-4 py-2 shadow-lg text-sm">
            {toast}
          </div>
        </div>
      )}

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
              Full gamelogs collected from games played on Board Game Arena
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
                <div className="text-sm font-semibold">Collected Gamelogs</div>
              </div>
              <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
                {scrapedAnim.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Download CTA */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-70 text-white px-4 py-2.5 shadow-sm"
              >
                {downloading ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v4l3.5-3.5L12 0v4a8 8 0 100 16v4l3.5-3.5L12 20v4a8 8 0 01-8-8z"></path>
                  </svg>
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {downloading ? "Downloading archive…" : "Download Full Dataset (.zip)"}
              </button>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {zipInfoLoading
                  ? "Fetching latest archive info…"
                  : zipInfo
                  ? `Latest: ${zipInfo.fileName} • ${zipInfo.sizeFormatted}`
                  : "Latest archive info unavailable"}
              </div>
            </div>

            {/* Progress display */}
            {downloading && (
              <div className="w-full sm:w-auto sm:min-w-[320px]">
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>Download progress</span>
                  <span>
                    {downloadProgress != null
                      ? `${Math.round(downloadProgress * 100)}%`
                      : downloadText || "Starting…"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  {downloadProgress != null ? (
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-[width] duration-150"
                      style={{ width: `${Math.round(downloadProgress * 100)}%` }}
                    />
                  ) : (
                    <div className="h-full w-1/3 bg-gradient-to-r from-amber-500 to-rose-500 animate-[pulse_1.2s_ease-in-out_infinite]" />
                  )}
                </div>
                {downloadText && (
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{downloadText}</div>
                )}
              </div>
            )}
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
              title="Indexed Games"
              icon={<Database className="w-5 h-5" />}
              value={totalGamesAnim.toLocaleString()}
            />
            <BigStat
              title="Collected game logs"
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
