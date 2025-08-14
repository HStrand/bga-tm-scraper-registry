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
    public class CardStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string AllCardStatsCacheKey = "AllCardStats:v2";
        private const string PreludeNamesCacheKey = "PreludeNames:v1";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public CardStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public class CardBasicStatsRow
        {
            public string Card { get; set; }
            public int TimesPlayed { get; set; }
            public double? WinRate { get; set; }
            public double? AvgElo { get; set; }
            public double? AvgEloChange { get; set; }
        }

        public async Task<List<CardBasicStatsRow>> GetAllCardStatsAsync()
        {
            if (Cache.TryGetValue(AllCardStatsCacheKey, out List<CardBasicStatsRow> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} card stats from cache");
                return cached;
            }

            var sql = @"
;WITH gp_dedup AS (
  SELECT
    gp.TableId, gp.PlayerId,
    gp.Position, gp.Elo, gp.EloChange,
    ROW_NUMBER() OVER (
      PARTITION BY gp.TableId, gp.PlayerId
      ORDER BY CASE WHEN gp.PlayerPerspective = gp.PlayerId THEN 0 ELSE 1 END,
               gp.GameId DESC
    ) AS rn
  FROM GamePlayers gp WITH (NOLOCK)
),
gp1 AS (
  SELECT TableId, PlayerId, Position, Elo, EloChange
  FROM gp_dedup
  WHERE rn = 1
),
g_dedup AS (
  SELECT
    g.TableId,
    ROW_NUMBER() OVER (
      PARTITION BY g.TableId
      ORDER BY g.IndexedAt DESC, g.Id DESC
    ) AS rn
  FROM Games g WITH (NOLOCK)
)
SELECT 
    gc.Card,
    COUNT(*) AS TimesPlayed,
    ROUND(AVG(CASE WHEN gp1.Position = 1 THEN 1.0 ELSE 0.0 END), 2) AS WinRate,
    ROUND(AVG(CAST(gp1.Elo AS float)), 2) AS AvgElo,
    ROUND(AVG(CAST(gp1.EloChange AS float)), 2) AS AvgEloChange
FROM GameCards gc WITH (NOLOCK)
JOIN gp1
  ON gp1.TableId = gc.TableId AND gp1.PlayerId = gc.PlayerId
JOIN (SELECT TableId FROM g_dedup WHERE rn = 1) g
  ON g.TableId = gc.TableId
JOIN GameStats gs WITH (NOLOCK)
  ON gs.TableId = gc.TableId
WHERE gc.PlayedGen IS NOT NULL
GROUP BY gc.Card
ORDER BY AvgEloChange DESC;";

            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            var rows = await conn.QueryAsync<CardBasicStatsRow>(sql);
            var list = rows.ToList();

            // Cache for 24 hours
            Cache.Set(
                AllCardStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            _logger.LogInformation($"Retrieved and cached {list.Count} card stats");
            return list;
        }

        public async Task<HashSet<string>> GetPreludeNamesAsync()
        {
            if (Cache.TryGetValue(PreludeNamesCacheKey, out HashSet<string> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} prelude names from cache");
                return cached;
            }

            var sql = "SELECT DISTINCT Prelude FROM StartingHandPreludes";

            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            var preludeNames = await conn.QueryAsync<string>(sql);
            var preludeSet = new HashSet<string>(preludeNames, StringComparer.OrdinalIgnoreCase);

            // Cache for 24 hours
            Cache.Set(
                PreludeNamesCacheKey,
                preludeSet,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            _logger.LogInformation($"Retrieved and cached {preludeSet.Count} prelude names");
            return preludeSet;
        }

        public async Task<List<CardBasicStatsRow>> GetProjectCardStatsAsync()
        {
            var allStats = await GetAllCardStatsAsync();
            var preludeNames = await GetPreludeNamesAsync();

            var projectCardStats = allStats
                .Where(card => !preludeNames.Contains(card.Card))
                .OrderByDescending(card => card.AvgEloChange)
                .ToList();

            _logger.LogInformation($"Filtered to {projectCardStats.Count} project card stats (excluding {preludeNames.Count} preludes)");
            return projectCardStats;
        }

        public async Task<List<CardBasicStatsRow>> GetPreludeStatsAsync()
        {
            var allStats = await GetAllCardStatsAsync();
            var preludeNames = await GetPreludeNamesAsync();

            var preludeStats = allStats
                .Where(card => preludeNames.Contains(card.Card))
                .OrderByDescending(card => card.AvgEloChange)
                .ToList();

            _logger.LogInformation($"Filtered to {preludeStats.Count} prelude stats");
            return preludeStats;
        }
    }
}
