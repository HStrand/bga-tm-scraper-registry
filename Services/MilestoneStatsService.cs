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
    public class MilestoneStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string MilestoneStatsCacheKey = "MilestoneStats:v1";
        private const string CacheContainerName = "cache";
        private const string MilestoneStatsBlobName = "milestone-stats.json";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public MilestoneStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<List<PlayerMilestoneStats>> GetPlayerMilestoneStatsAsync()
        {
            if (Cache.TryGetValue(MilestoneStatsCacheKey, out List<PlayerMilestoneStats> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} milestone stats from cache");
                return cached;
            }

            // Try read from blob cross-instance cache
            var blobList = await TryReadFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    MilestoneStatsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} milestone stats from blob cache");
                return blobList;
            }

            var list = await ComputeMilestoneStatsFromDbAsync();

            // Cache for 24 hours
            Cache.Set(
                MilestoneStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            // Write to blob for cross-instance warm cache
            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} milestone stats");
            return list;
        }

        public async Task RefreshMilestoneStatsCacheAsync()
        {
            var list = await ComputeMilestoneStatsFromDbAsync();

            Cache.Set(
                MilestoneStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Refreshed milestone stats cache with {list.Count} rows");
        }

        private async Task<List<PlayerMilestoneStats>> ComputeMilestoneStatsFromDbAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                ;WITH TharsisGames AS (
                  SELECT
                      gp.PlayerId,
                      gp.PlayerName,
                      TharsisGames = COUNT(DISTINCT gp.TableId)
                  FROM dbo.GamePlayers AS gp
                  JOIN dbo.Games      AS g  ON g.TableId = gp.TableId
                  WHERE g.Map = N'Tharsis'
                  GROUP BY gp.PlayerId, gp.PlayerName
                ),
                Milestones AS (
                  SELECT
                      gm.ClaimedBy AS PlayerId,
                      Terraformer = SUM(CASE WHEN gm.Milestone = N'Terraformer' THEN 1 ELSE 0 END),
                      Gardener    = SUM(CASE WHEN gm.Milestone = N'Gardener'    THEN 1 ELSE 0 END),
                      Builder     = SUM(CASE WHEN gm.Milestone = N'Builder'     THEN 1 ELSE 0 END),
                      Mayor       = SUM(CASE WHEN gm.Milestone = N'Mayor'       THEN 1 ELSE 0 END),
                      Planner     = SUM(CASE WHEN gm.Milestone = N'Planner'     THEN 1 ELSE 0 END)
                  FROM dbo.GameMilestones AS gm
                  JOIN dbo.Games          AS g ON g.TableId = gm.TableId
                  WHERE g.Map = N'Tharsis'
                    AND gm.Milestone IN (N'Terraformer', N'Gardener', N'Builder', N'Mayor', N'Planner')
                  GROUP BY gm.ClaimedBy
                )
                SELECT
                    tg.PlayerId,
                    tg.PlayerName,
                    tg.TharsisGames,
                    Terraformer = ISNULL(m.Terraformer, 0),
                    Gardener    = ISNULL(m.Gardener,    0),
                    Builder     = ISNULL(m.Builder,     0),
                    Mayor       = ISNULL(m.Mayor,       0),
                    Planner     = ISNULL(m.Planner,     0),

                    -- rates (claims per Tharsis game)
                    TerraformerRate = CAST(ISNULL(m.Terraformer, 0) AS decimal(18,4)) / NULLIF(tg.TharsisGames, 0),
                    GardenerRate    = CAST(ISNULL(m.Gardener,    0) AS decimal(18,4)) / NULLIF(tg.TharsisGames, 0),
                    BuilderRate     = CAST(ISNULL(m.Builder,     0) AS decimal(18,4)) / NULLIF(tg.TharsisGames, 0),
                    MayorRate       = CAST(ISNULL(m.Mayor,       0) AS decimal(18,4)) / NULLIF(tg.TharsisGames, 0),
                    PlannerRate     = CAST(ISNULL(m.Planner,     0) AS decimal(18,4)) / NULLIF(tg.TharsisGames, 0)
                FROM TharsisGames AS tg
                LEFT JOIN Milestones AS m
                  ON m.PlayerId = tg.PlayerId
                WHERE tg.TharsisGames >= 30";

            var results = await connection.QueryAsync<PlayerMilestoneStats>(query, commandTimeout: 300); // 5 minutes
            return results.ToList();
        }

        private async Task<List<PlayerMilestoneStats>> TryReadFromBlobAsync()
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
                var blob = container.GetBlobClient(MilestoneStatsBlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<PlayerMilestoneStats>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read milestone stats from blob cache");
                return null;
            }
        }

        private async Task TryWriteToBlobAsync(List<PlayerMilestoneStats> list)
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
                var blob = container.GetBlobClient(MilestoneStatsBlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write milestone stats to blob cache");
            }
        }
    }
}
