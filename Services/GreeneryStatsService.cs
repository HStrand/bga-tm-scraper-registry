using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using BgaTmScraperRegistry.Models;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Caching.Memory;
using System.Text.Json;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace BgaTmScraperRegistry.Services
{
    public class GreeneryStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string GreeneryStatsCacheKey = "GreeneryStats:v1";
        private const string CacheContainerName = "cache";
        private const string GreeneryStatsBlobName = "greenery-stats.json";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public GreeneryStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<List<PlayerGreeneryStats>> GetPlayerGreeneryStatsAsync()
        {
            // Try in-memory cache first
            if (Cache.TryGetValue(GreeneryStatsCacheKey, out List<PlayerGreeneryStats> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} greenery stats from cache");
                return cached;
            }

            // Try read from blob cross-instance cache
            var blobList = await TryReadFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    GreeneryStatsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} greenery stats from blob cache");
                return blobList;
            }

            // Compute from DB
            var list = await ComputePlayerGreeneryStatsFromDbAsync();

            // Cache for 24 hours
            Cache.Set(
                GreeneryStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            // Write to blob for cross-instance warm cache
            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} greenery stats");
            return list;
        }

        public async Task RefreshGreeneryStatsCacheAsync()
        {
            var list = await ComputePlayerGreeneryStatsFromDbAsync();

            Cache.Set(
                GreeneryStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Refreshed greenery stats cache with {list.Count} rows");
        }

        private async Task<List<PlayerGreeneryStats>> ComputePlayerGreeneryStatsFromDbAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                ;WITH agg AS (
                SELECT
                    gl.PlayerId,
                    Greeneries = COUNT(*),
                    GameCount  = COUNT(DISTINCT gl.TableId)
                FROM dbo.GameGreeneryLocations AS gl
                GROUP BY gl.PlayerId
            ),
            player_games AS (  -- one row per (PlayerId, TableId)
                SELECT DISTINCT gl.PlayerId, gl.TableId
                FROM dbo.GameGreeneryLocations AS gl
            ),
            gen_per_player AS (  -- sum of generations across the player's games
                SELECT
                    pg.PlayerId,
                    TotalGenerations = SUM(CAST(gs.Generations AS bigint))  -- column from GameStats
                FROM player_games pg
                JOIN dbo.GameStats gs
                ON gs.TableId = pg.TableId
                GROUP BY pg.PlayerId
            )
            SELECT
                p.Name,
                p.PlayerId,
                a.Greeneries,
                a.GameCount,
	            GreeneriesPerGame =
                    CAST(a.Greeneries AS decimal(18,4)) 
                    / NULLIF(CAST(a.GameCount AS decimal(18,4)), 0),
                GreeneriesPerGeneration =
                    CAST(a.Greeneries AS decimal(18,4)) 
                    / NULLIF(CAST(gpp.TotalGenerations AS decimal(18,4)), 0)
            FROM agg AS a
            JOIN dbo.Players AS p
                ON p.PlayerId = a.PlayerId
            JOIN gen_per_player AS gpp
                ON gpp.PlayerId = a.PlayerId
            WHERE a.GameCount >= 30
            ORDER BY GreeneriesPerGeneration DESC;";

            var results = await connection.QueryAsync<PlayerGreeneryStats>(query, commandTimeout: 300); // 5 minutes
            var statsList = results.ToList();

            _logger.LogInformation($"Retrieved greenery statistics for {statsList.Count} players");
            return statsList;
        }

        private async Task<List<PlayerGreeneryStats>> TryReadFromBlobAsync()
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
                var blob = container.GetBlobClient(GreeneryStatsBlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<PlayerGreeneryStats>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read greenery stats from blob cache");
                return null;
            }
        }

        private async Task TryWriteToBlobAsync(List<PlayerGreeneryStats> list)
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
                var blob = container.GetBlobClient(GreeneryStatsBlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write greenery stats to blob cache");
            }
        }
    }
}
