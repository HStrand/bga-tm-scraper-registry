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
using BgaTmScraperRegistry.Models;

namespace BgaTmScraperRegistry.Services
{
    public class StartingHandStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string CacheKey = "StartingHandStats:v1";
        private const string CacheContainerName = "cache";
        private const string BlobName = "starting-hand-stats.json";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public StartingHandStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<List<StartingHandStatsRow>> GetAllStartingHandStatsAsync()
        {
            if (Cache.TryGetValue(CacheKey, out List<StartingHandStatsRow> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} starting hand stats from cache");
                return cached;
            }

            // Try read from blob cross-instance cache
            var blobList = await TryReadFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    CacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} starting hand stats from blob cache");
                return blobList;
            }

            var list = await ComputeStartingHandStatsFromDbAsync();

            Cache.Set(
                CacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} starting hand stats");
            return list;
        }

        public async Task RefreshStartingHandStatsCacheAsync()
        {
            var list = await ComputeStartingHandStatsFromDbAsync();

            Cache.Set(
                CacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Refreshed starting hand stats cache with {list.Count} rows");
        }

        private async Task<List<StartingHandStatsRow>> ComputeStartingHandStatsFromDbAsync()
        {
            var sql = @"
WITH AllPlayers AS
(
    SELECT
        gp.TableId,
        gp.PlayerId,
        CONVERT(float, gp.EloChange) AS EloChange
    FROM dbo.Games_Canonical g
    JOIN dbo.GamePlayers_Canonical gp
      ON gp.TableId = g.TableId
    JOIN dbo.GameStats gs
      ON gs.TableId = g.TableId
    WHERE
        g.ColoniesOn = 0
        AND g.DraftOn = 1
        AND g.GameMode <> 'Friendly mode'
        AND gs.PlayerCount = 2
),
CardOffers AS
(
    SELECT DISTINCT
        shc.TableId,
        shc.PlayerId,
        shc.Card,
        shc.Kept
    FROM dbo.StartingHandCards shc
)
SELECT
    co.Card,

    COUNT_BIG(*) AS OfferedGames,

    SUM(CASE WHEN co.Kept = 1 THEN 1 ELSE 0 END) AS KeptGames,
    SUM(CASE WHEN co.Kept = 0 THEN 1 ELSE 0 END) AS NotKeptGames,

    CAST(SUM(CASE WHEN co.Kept = 1 THEN 1 ELSE 0 END) AS float)
      / NULLIF(COUNT_BIG(*), 0) AS KeepRate,

    AVG(ap.EloChange) AS AvgEloChangeOffered,
    AVG(CASE WHEN co.Kept = 1 THEN ap.EloChange END) AS AvgEloChangeKept,
    AVG(CASE WHEN co.Kept = 0 THEN ap.EloChange END) AS AvgEloChangeNotKept

FROM CardOffers co
JOIN AllPlayers ap
  ON ap.TableId  = co.TableId
 AND ap.PlayerId = co.PlayerId
GROUP BY
    co.Card
ORDER BY
    AvgEloChangeOffered DESC;";

            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            var rows = await conn.QueryAsync<StartingHandStatsRow>(sql, commandTimeout: 300);

            var filtered = rows.Where(c => !
                new List<string>
                {
                    "City",
                    "Greenery",
                    "Aquifer",
                    "Sell patents",
                }
                .Contains(c.Card))
                .ToList();

            return filtered;
        }

        private async Task<List<StartingHandStatsRow>> TryReadFromBlobAsync()
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
                var blob = container.GetBlobClient(BlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<StartingHandStatsRow>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read starting hand stats from blob cache");
                return null;
            }
        }

        private async Task TryWriteToBlobAsync(List<StartingHandStatsRow> list)
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
                var blob = container.GetBlobClient(BlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write starting hand stats to blob cache");
            }
        }
    }
}
