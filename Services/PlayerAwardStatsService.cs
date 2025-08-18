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
    public class PlayerAwardStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string PlayerAwardStatsCacheKey = "PlayerAwardStats:v1";
        private const string CacheContainerName = "cache";
        private const string PlayerAwardStatsBlobName = "player-award-stats.json";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public PlayerAwardStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<List<PlayerAwardStats>> GetPlayerAwardStatsAsync()
        {
            if (Cache.TryGetValue(PlayerAwardStatsCacheKey, out List<PlayerAwardStats> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} player award stats from cache");
                return cached;
            }

            // Try read from blob cross-instance cache
            var blobList = await TryReadFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    PlayerAwardStatsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} player award stats from blob cache");
                return blobList;
            }

            var list = await ComputePlayerAwardStatsFromDbAsync();

            // Cache for 24 hours
            Cache.Set(
                PlayerAwardStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            // Write to blob for cross-instance warm cache
            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} player award stats");
            return list;
        }

        public async Task RefreshPlayerAwardStatsCacheAsync()
        {
            var list = await ComputePlayerAwardStatsFromDbAsync();

            Cache.Set(
                PlayerAwardStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Refreshed player award stats cache with {list.Count} rows");
        }

        private async Task<List<PlayerAwardStats>> ComputePlayerAwardStatsFromDbAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                ;WITH TharsisGames AS (
                  SELECT
                      gp.PlayerId,
                      p.Name AS PlayerName,
                      TharsisGames = COUNT(DISTINCT gp.TableId)
                  FROM dbo.GamePlayers AS gp
                  JOIN dbo.Games       AS g ON g.TableId = gp.TableId
                  LEFT JOIN dbo.Players AS p ON p.PlayerId = gp.PlayerId
                  WHERE g.Map = N'Tharsis'
                  GROUP BY gp.PlayerId, p.Name
                ),
                Awards AS (
                  SELECT
                      gpa.PlayerId,
                      Thermalist = SUM(CASE WHEN gpa.Award = N'Thermalist' THEN 1 ELSE 0 END),
                      Banker     = SUM(CASE WHEN gpa.Award = N'Banker'     THEN 1 ELSE 0 END),
                      Scientist  = SUM(CASE WHEN gpa.Award = N'Scientist'  THEN 1 ELSE 0 END),
                      Miner      = SUM(CASE WHEN gpa.Award = N'Miner'      THEN 1 ELSE 0 END),
                      Landlord   = SUM(CASE WHEN gpa.Award = N'Landlord'   THEN 1 ELSE 0 END)
                  FROM dbo.GamePlayerAwards AS gpa
                  JOIN dbo.Games            AS g ON g.TableId = gpa.TableId
                  WHERE g.Map = N'Tharsis'
                    AND gpa.PlayerPlace = 1
                    AND gpa.Award IN (N'Thermalist', N'Banker', N'Scientist', N'Miner', N'Landlord')
                  GROUP BY gpa.PlayerId
                )
                SELECT
                    tg.PlayerId,
                    tg.PlayerName,
                    tg.TharsisGames,
                    Thermalist = ISNULL(a.Thermalist, 0),
                    Banker     = ISNULL(a.Banker,     0),
                    Scientist  = ISNULL(a.Scientist,  0),
                    Miner      = ISNULL(a.Miner,      0),
                    Landlord   = ISNULL(a.Landlord,   0),
                    TotalFirsts = ISNULL(a.Thermalist,0)+ISNULL(a.Banker,0)+ISNULL(a.Scientist,0)+ISNULL(a.Miner,0)+ISNULL(a.Landlord,0),

                    -- rates (per Tharsis game)
                    ThermalistRate = CAST(ISNULL(a.Thermalist,0) AS decimal(18,4)) / NULLIF(tg.TharsisGames,0),
                    BankerRate     = CAST(ISNULL(a.Banker,    0) AS decimal(18,4)) / NULLIF(tg.TharsisGames,0),
                    ScientistRate  = CAST(ISNULL(a.Scientist, 0) AS decimal(18,4)) / NULLIF(tg.TharsisGames,0),
                    MinerRate      = CAST(ISNULL(a.Miner,     0) AS decimal(18,4)) / NULLIF(tg.TharsisGames,0),
                    LandlordRate   = CAST(ISNULL(a.Landlord,  0) AS decimal(18,4)) / NULLIF(tg.TharsisGames,0),
                    TotalAwardRate =
                      CAST(ISNULL(a.Thermalist,0)+ISNULL(a.Banker,0)+ISNULL(a.Scientist,0)+ISNULL(a.Miner,0)+ISNULL(a.Landlord,0) AS decimal(18,4))
                      / NULLIF(tg.TharsisGames,0)
                FROM TharsisGames AS tg
                LEFT JOIN Awards  AS a ON a.PlayerId = tg.PlayerId
                WHERE tg.TharsisGames >= 30 AND tg.PlayerName IS NOT NULL";

            var results = await connection.QueryAsync<PlayerAwardStats>(query, commandTimeout: 300); // 5 minutes
            return results.ToList();
        }

        private async Task<List<PlayerAwardStats>> TryReadFromBlobAsync()
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
                var blob = container.GetBlobClient(PlayerAwardStatsBlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<PlayerAwardStats>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read player award stats from blob cache");
                return null;
            }
        }

        private async Task TryWriteToBlobAsync(List<PlayerAwardStats> list)
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
                var blob = container.GetBlobClient(PlayerAwardStatsBlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write player award stats to blob cache");
            }
        }
    }
}
