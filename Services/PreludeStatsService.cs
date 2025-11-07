using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using Dapper;

namespace BgaTmScraperRegistry.Services
{
    /// <summary>
    /// Server-side, filterable prelude rankings based on StartingHandPreludes (Kept = 1),
    /// joined to Games/GameStats/GamePlayers/GamePlayerStats to support the same filters
    /// used on the Corporations overview page, plus an additional Corporation filter.
    /// </summary>
    public class PreludeStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());

        private const string AllPreludePlayerRowsCacheKey = "AllPreludePlayerRows:v2";
        private const string OptionsCacheKey = "PreludeFilterOptions:v1";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public PreludeStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public class PreludePlayerRow
        {
            public int TableId { get; set; }
            public int PlayerId { get; set; }
            public string Prelude { get; set; }

            public string Map { get; set; }
            public bool? PreludeOn { get; set; }
            public bool? ColoniesOn { get; set; }
            public bool? DraftOn { get; set; }
            public string GameMode { get; set; }
            public string GameSpeed { get; set; }

            public int? PlayerCount { get; set; }
            public int? Generations { get; set; }

            public string Corporation { get; set; }
            public string PlayerName { get; set; }
            public int? Elo { get; set; }
            public int? EloChange { get; set; }
            public int? Position { get; set; }
        }

        public class PreludeFilter
        {
            public string[] Maps { get; set; }
            public bool? PreludeOn { get; set; }
            public bool? ColoniesOn { get; set; }
            public bool? DraftOn { get; set; }
            public string[] Modes { get; set; }
            public string[] Speeds { get; set; }
            public int[] PlayerCounts { get; set; }
            public int? EloMin { get; set; }
            public int? EloMax { get; set; }
            public int? GenerationsMin { get; set; }
            public int? GenerationsMax { get; set; }
            public int? TimesPlayedMin { get; set; }
            public int? TimesPlayedMax { get; set; }
            public string PlayerName { get; set; }
            public string Corporation { get; set; }
        }

        public class PreludeRanking
        {
            public string Prelude { get; set; }   // display name as stored in StartingHandPreludes.Prelude
            public double WinRate { get; set; }   // percent 0..100 for parity with corporation endpoint
            public double AvgEloGain { get; set; }
            public int GamesPlayed { get; set; }
            public double AvgElo { get; set; }
        }

        public class PreludeFilterOptions
        {
            public string[] Maps { get; set; }
            public string[] GameModes { get; set; }
            public string[] GameSpeeds { get; set; }
            public int[] PlayerCounts { get; set; }
            public Range EloRange { get; set; }
            public Range GenerationsRange { get; set; }
            public string[] Corporations { get; set; }

            public class Range
            {
                public int Min { get; set; }
                public int Max { get; set; }
            }
        }

        private static string BuildRankingsCacheKey(PreludeFilter f)
        {
            string Join(string[] arr) => arr == null ? "" : string.Join(",", arr.OrderBy(x => x ?? string.Empty));
            string JoinInt(int[] arr) => arr == null ? "" : string.Join(",", arr.OrderBy(x => x));
            string B(bool? b) => b.HasValue ? (b.Value ? "1" : "0") : "";
            string N(int? n) => n.HasValue ? n.Value.ToString() : "";
            f ??= new PreludeFilter();
            var key = $"PreludeRankings:v1|maps={Join(f.Maps)}|prelude={B(f.PreludeOn)}|colonies={B(f.ColoniesOn)}|draft={B(f.DraftOn)}|modes={Join(f.Modes)}|speeds={Join(f.Speeds)}|pc={JoinInt(f.PlayerCounts)}|eloMin={N(f.EloMin)}|eloMax={N(f.EloMax)}|genMin={N(f.GenerationsMin)}|genMax={N(f.GenerationsMax)}|tpMin={N(f.TimesPlayedMin)}|tpMax={N(f.TimesPlayedMax)}|player={f.PlayerName?.Trim().ToLowerInvariant() ?? ""}|corp={f.Corporation?.Trim().ToLowerInvariant() ?? ""}";
            return key;
        }

        /// <summary>
        /// Returns the deduplicated, joined per-player rows for each kept prelude.
        /// </summary>
        public async Task<List<PreludePlayerRow>> GetAllPreludePlayerRowsAsync()
        {
            if (Cache.TryGetValue(AllPreludePlayerRowsCacheKey, out List<PreludePlayerRow> cached))
            {
                _logger.LogInformation("Returning prelude player rows from memory cache with {count} rows", cached.Count);
                return cached;
            }

            // Deduplicate Games and GamePlayers the same way as in CorporationStatsService
            var sql = @"
;WITH best_g AS (
    SELECT g.TableId, g.Map, g.PreludeOn, g.ColoniesOn, g.DraftOn,
           g.GameMode, g.GameSpeed,
           rn = ROW_NUMBER() OVER (
               PARTITION BY g.TableId
               ORDER BY g.IndexedAt DESC, g.Id DESC
           )
    FROM Games g WITH (NOLOCK)
),
best_gp AS (
    SELECT gp.TableId, gp.PlayerId,
           gp.PlayerName, gp.Elo, gp.EloChange, gp.Position,
           rn = ROW_NUMBER() OVER (
               PARTITION BY gp.TableId, gp.PlayerId
               ORDER BY gp.GameId DESC
           )
    FROM GamePlayers gp WITH (NOLOCK)
)
SELECT 
    shp.TableId,
    shp.PlayerId,
    shp.Prelude,
    g.Map,
    g.PreludeOn,
    g.ColoniesOn,
    g.DraftOn,
    g.GameMode,
    g.GameSpeed,
    gs.PlayerCount,
    gs.Generations,
    gps.Corporation,
    gp.PlayerName,
    gp.Elo,
    gp.EloChange,
    gp.Position
FROM StartingHandPreludes shp WITH (NOLOCK)
JOIN best_g g
  ON g.TableId = shp.TableId AND g.rn = 1
JOIN GameStats gs WITH (NOLOCK)
  ON gs.TableId = shp.TableId
JOIN best_gp gp
  ON gp.TableId = shp.TableId AND gp.PlayerId = shp.PlayerId AND gp.rn = 1
JOIN GamePlayerStats gps WITH (NOLOCK)
  ON gps.TableId = shp.TableId AND gps.PlayerId = shp.PlayerId
WHERE shp.Kept = 1
ORDER BY shp.TableId DESC;";

            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            var rows = await conn.QueryAsync<PreludePlayerRow>(sql, commandTimeout: 600);
            var list = rows.ToList();

            NormalizePreludeNames(list);

            Cache.Set(
                AllPreludePlayerRowsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            _logger.LogInformation("Retrieved and cached {count} prelude player rows", list.Count);
            return list;
        }

        private static void NormalizePreludeNames(List<PreludePlayerRow> list)
        {
            if (list == null) return;
            foreach (var r in list)
            {
                if (!string.IsNullOrWhiteSpace(r.Prelude) && r.Prelude.Equals("Allied Bank", StringComparison.OrdinalIgnoreCase))
                {
                    r.Prelude = "Allied Banks";
                }
                if (!string.IsNullOrWhiteSpace(r.Prelude) && r.Prelude.Equals("Excentric Sponsor", StringComparison.OrdinalIgnoreCase))
                {
                    r.Prelude = "Eccentric Sponsor";
                }
            }
        }

        public async Task<PreludeFilterOptions> GetPreludeFilterOptionsAsync()
        {
            if (Cache.TryGetValue(OptionsCacheKey, out PreludeFilterOptions cached))
            {
                _logger.LogInformation("Returning prelude filter options from memory cache");
                return cached;
            }

            var rows = await GetAllPreludePlayerRowsAsync();

            var maps = rows.Where(r => !string.IsNullOrWhiteSpace(r.Map))
                           .Select(r => r.Map)
                           .Distinct()
                           .OrderBy(x => x)
                           .ToArray();

            var modes = rows.Where(r => !string.IsNullOrWhiteSpace(r.GameMode))
                            .Select(r => r.GameMode)
                            .Distinct()
                            .OrderBy(x => x)
                            .ToArray();

            var speeds = rows.Where(r => !string.IsNullOrWhiteSpace(r.GameSpeed))
                             .Select(r => r.GameSpeed)
                             .Distinct()
                             .OrderBy(x => x)
                             .ToArray();

            var playerCounts = rows.Where(r => r.PlayerCount.HasValue)
                                   .Select(r => r.PlayerCount!.Value)
                                   .Distinct()
                                   .OrderBy(x => x)
                                   .ToArray();

            var eloVals = rows.Where(r => r.Elo.HasValue && r.Elo.Value > 0).Select(r => r.Elo!.Value).ToArray();
            var genVals = rows.Where(r => r.Generations.HasValue).Select(r => r.Generations!.Value).ToArray();

            var corporations = rows.Where(r => !string.IsNullOrWhiteSpace(r.Corporation))
                                   .Select(r => r.Corporation)
                                   .Distinct(StringComparer.OrdinalIgnoreCase)
                                   .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
                                   .ToArray();

            var options = new PreludeFilterOptions
            {
                Maps = maps,
                GameModes = modes,
                GameSpeeds = speeds,
                PlayerCounts = playerCounts,
                EloRange = new PreludeFilterOptions.Range
                {
                    Min = eloVals.Length > 0 ? eloVals.Min() : 0,
                    Max = eloVals.Length > 0 ? eloVals.Max() : 0
                },
                GenerationsRange = new PreludeFilterOptions.Range
                {
                    Min = genVals.Length > 0 ? genVals.Min() : 0,
                    Max = genVals.Length > 0 ? genVals.Max() : 0
                },
                Corporations = corporations
            };

            Cache.Set(OptionsCacheKey, options, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
            });

            _logger.LogInformation("Computed and cached prelude filter options");
            return options;
        }

        public async Task<List<PreludeRanking>> GetPreludeRankingsAsync(PreludeFilter filter)
        {
            var cacheKey = BuildRankingsCacheKey(filter);
            if (Cache.TryGetValue(cacheKey, out List<PreludeRanking> cached))
            {
                _logger.LogInformation("Returning {count} prelude rankings from memory cache for key {key}", cached.Count, cacheKey);
                return cached;
            }

            var rows = await GetAllPreludePlayerRowsAsync();
            IEnumerable<PreludePlayerRow> q = rows;

            if (filter != null)
            {
                if (filter.Maps != null && filter.Maps.Length > 0)
                    q = q.Where(r => !string.IsNullOrEmpty(r.Map) && filter.Maps.Contains(r.Map));
                if (filter.PreludeOn.HasValue)
                    q = q.Where(r => r.PreludeOn.HasValue && r.PreludeOn.Value == filter.PreludeOn.Value);
                if (filter.ColoniesOn.HasValue)
                    q = q.Where(r => r.ColoniesOn.HasValue && r.ColoniesOn.Value == filter.ColoniesOn.Value);
                if (filter.DraftOn.HasValue)
                    q = q.Where(r => r.DraftOn.HasValue && r.DraftOn.Value == filter.DraftOn.Value);
                if (filter.Modes != null && filter.Modes.Length > 0)
                    q = q.Where(r => !string.IsNullOrEmpty(r.GameMode) && filter.Modes.Contains(r.GameMode));
                if (filter.Speeds != null && filter.Speeds.Length > 0)
                    q = q.Where(r => !string.IsNullOrEmpty(r.GameSpeed) && filter.Speeds.Contains(r.GameSpeed));
                if (filter.PlayerCounts != null && filter.PlayerCounts.Length > 0)
                    q = q.Where(r => r.PlayerCount.HasValue && filter.PlayerCounts.Contains(r.PlayerCount.Value));
                if (filter.EloMin.HasValue)
                    q = q.Where(r => r.Elo.HasValue && r.Elo.Value > 0 && r.Elo.Value >= filter.EloMin.Value);
                if (filter.EloMax.HasValue)
                    q = q.Where(r => r.Elo.HasValue && r.Elo.Value > 0 && r.Elo.Value <= filter.EloMax.Value);
                if (filter.GenerationsMin.HasValue)
                    q = q.Where(r => r.Generations.HasValue && r.Generations.Value >= filter.GenerationsMin.Value);
                if (filter.GenerationsMax.HasValue)
                    q = q.Where(r => r.Generations.HasValue && r.Generations.Value <= filter.GenerationsMax.Value);
                if (!string.IsNullOrWhiteSpace(filter.PlayerName))
                    q = q.Where(r => !string.IsNullOrEmpty(r.PlayerName) && r.PlayerName.Contains(filter.PlayerName, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrWhiteSpace(filter.Corporation))
                    q = q.Where(r => !string.IsNullOrEmpty(r.Corporation) && string.Equals(r.Corporation, filter.Corporation, StringComparison.OrdinalIgnoreCase));
            }

            var grouped = q
                .GroupBy(r => r.Prelude)
                .Select(g =>
                {
                    var games = g.Count();
                    var wins = g.Count(r => r.Position == 1);
                    var avgEloGain = g.Select(r => (double)(r.EloChange ?? 0)).DefaultIfEmpty(0).Average();
                    var avgElo = g.Select(r => (double)(r.Elo ?? 0)).DefaultIfEmpty(0).Average();

                    return new PreludeRanking
                    {
                        Prelude = g.Key,
                        WinRate = games == 0 ? 0.0 : (double)wins / games * 100.0,
                        AvgEloGain = avgEloGain,
                        GamesPlayed = games,
                        AvgElo = avgElo
                    };
                })
                .ToList();

            if (filter?.TimesPlayedMin.HasValue == true)
                grouped = grouped.Where(r => r.GamesPlayed >= filter.TimesPlayedMin.Value).ToList();
            if (filter?.TimesPlayedMax.HasValue == true)
                grouped = grouped.Where(r => r.GamesPlayed <= filter.TimesPlayedMax.Value).ToList();

            // Default sort similar to corporations: by WinRate desc then GamesPlayed desc
            grouped = grouped
                .OrderByDescending(r => r.WinRate)
                .ThenByDescending(r => r.GamesPlayed)
                .ToList();

            Cache.Set(cacheKey, grouped, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
            });

            _logger.LogInformation("Computed and cached {count} prelude rankings for key {key}", grouped.Count, cacheKey);
            return grouped;
        }
    }
}
