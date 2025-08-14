using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using Dapper;
using System.Text.Json;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace BgaTmScraperRegistry.Services
{
    public class CardStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string AllCardStatsCacheKey = "AllCardStats:v2";
        private const string PreludeNamesCacheKey = "PreludeNames:v1";
        private const string CacheContainerName = "cache";
        private const string CardStatsBlobName = "card-stats.json";
        private const string AllCardOptionStatsCacheKey = "AllCardOptionStats:v1";
        private const string CardOptionStatsBlobName = "card-option-stats.json";

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

            // Try read from blob cross-instance cache
            var blobList = await TryReadFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    AllCardStatsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} card stats from blob cache");
                return blobList;
            }

            var list = await ComputeAllCardStatsFromDbAsync();

            // Cache for 24 hours
            Cache.Set(
                AllCardStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            // Write to blob for cross-instance warm cache
            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} card stats");
            return list;
        }

        public async Task<List<CardBasicStatsRow>> GetAllCardOptionStatsAsync()
        {
            if (Cache.TryGetValue(AllCardOptionStatsCacheKey, out List<CardBasicStatsRow> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} card option stats from cache");
                return cached;
            }

            // Try read from blob cross-instance cache
            var blobList = await TryReadOptionFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    AllCardOptionStatsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} card option stats from blob cache");
                return blobList;
            }

            var list = await ComputeAllCardOptionStatsFromDbAsync();

            Cache.Set(
                AllCardOptionStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteOptionToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} card option stats");
            return list;
        }

        public async Task RefreshAllCardStatsCacheAsync()
        {
            var list = await ComputeAllCardStatsFromDbAsync();

            Cache.Set(
                AllCardStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Refreshed card stats cache with {list.Count} rows");
        }

        public async Task RefreshAllCardOptionStatsCacheAsync()
        {
            var list = await ComputeAllCardOptionStatsFromDbAsync();

            Cache.Set(
                AllCardOptionStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteOptionToBlobAsync(list);

            _logger.LogInformation($"Refreshed card option stats cache with {list.Count} rows");
        }

        private async Task<List<CardBasicStatsRow>> ComputeAllCardStatsFromDbAsync()
        {
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
    ROUND(AVG(CASE WHEN gp1.Position = 1 THEN 1.0 ELSE 0.0 END), 3) AS WinRate,
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
            var rows = await conn.QueryAsync<CardBasicStatsRow>(sql, commandTimeout: 300); // 5 minutes

            rows = rows.Where(c => !
            new List<string>
            {
                    "City",
                    "Greenery",
                    "Aquifer",
                    "Sell patents",
                    "Undo (no undo beyond this point)",
                    "(no undo beyond this point)",
            }
            .Contains(c.Card) &&
            !c.Card.Contains("a card "))
            .ToList();

            return rows.ToList();
        }

        private async Task<List<CardBasicStatsRow>> TryReadFromBlobAsync()
        {
            try
            {
                var blobConn = Environment.GetEnvironmentVariable("BlobStorageConnectionString");
                if (string.IsNullOrWhiteSpace(blobConn))
                {
                    return null;
                }

                var service = new BlobServiceClient(blobConn);
                var container = service.GetBlobContainerClient(CacheContainerName);
                var blob = container.GetBlobClient(CardStatsBlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<CardBasicStatsRow>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read card stats from blob cache");
                return null;
            }
        }

        private async Task TryWriteToBlobAsync(List<CardBasicStatsRow> list)
        {
            try
            {
                var blobConn = Environment.GetEnvironmentVariable("BlobStorageConnectionString");
                if (string.IsNullOrWhiteSpace(blobConn))
                {
                    return;
                }

                var service = new BlobServiceClient(blobConn);
                var container = service.GetBlobContainerClient(CacheContainerName);
                await container.CreateIfNotExistsAsync();
                var blob = container.GetBlobClient(CardStatsBlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write card stats to blob cache");
            }
        }

        private async Task<List<CardBasicStatsRow>> ComputeAllCardOptionStatsFromDbAsync()
        {
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
    ROUND(AVG(CASE WHEN gp1.Position = 1 THEN 1.0 ELSE 0.0 END), 3) AS WinRate,
    ROUND(AVG(CAST(gp1.Elo AS float)), 2) AS AvgElo,
    ROUND(AVG(CAST(gp1.EloChange AS float)), 2) AS AvgEloChange
FROM GameCards gc WITH (NOLOCK)
JOIN gp1
  ON gp1.TableId = gc.TableId AND gp1.PlayerId = gc.PlayerId
JOIN (SELECT TableId FROM g_dedup WHERE rn = 1) g
  ON g.TableId = gc.TableId
JOIN GameStats gs WITH (NOLOCK)
  ON gs.TableId = gc.TableId
WHERE gc.DrawnGen IS NOT NULL
GROUP BY gc.Card
ORDER BY AvgEloChange DESC;";

            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            var rows = await conn.QueryAsync<CardBasicStatsRow>(sql, commandTimeout: 300); // 5 minutes

            rows = rows.Where(c => !
            new List<string>
            {
                    "City",
                    "Greenery",
                    "Aquifer",
                    "Sell patents",
                    "Undo (no undo beyond this point)",
                    "(no undo beyond this point)",
            }
            .Contains(c.Card) &&
            !c.Card.Contains("a card "))
            .ToList();

            return rows.ToList();
        }

        private async Task<List<CardBasicStatsRow>> TryReadOptionFromBlobAsync()
        {
            try
            {
                var blobConn = Environment.GetEnvironmentVariable("BlobStorageConnectionString");
                if (string.IsNullOrWhiteSpace(blobConn))
                {
                    return null;
                }

                var service = new BlobServiceClient(blobConn);
                var container = service.GetBlobContainerClient(CacheContainerName);
                var blob = container.GetBlobClient(CardOptionStatsBlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<CardBasicStatsRow>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read card option stats from blob cache");
                return null;
            }
        }

        private async Task TryWriteOptionToBlobAsync(List<CardBasicStatsRow> list)
        {
            try
            {
                var blobConn = Environment.GetEnvironmentVariable("BlobStorageConnectionString");
                if (string.IsNullOrWhiteSpace(blobConn))
                {
                    return;
                }

                var service = new BlobServiceClient(blobConn);
                var container = service.GetBlobContainerClient(CacheContainerName);
                await container.CreateIfNotExistsAsync();
                var blob = container.GetBlobClient(CardOptionStatsBlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write card option stats to blob cache");
            }
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

        public async Task<List<CardBasicStatsRow>> GetProjectCardOptionStatsAsync()
        {
            var allStats = await GetAllCardOptionStatsAsync();
            var preludeNames = await GetPreludeNamesAsync();

            var projectCardStats = allStats
                .Where(card => !preludeNames.Contains(card.Card))
                .OrderByDescending(card => card.AvgEloChange)
                .ToList();

            _logger.LogInformation($"Filtered to {projectCardStats.Count} project card option stats (excluding {preludeNames.Count} preludes)");
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
