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
        private const string AllMilestoneStatsCacheKey = "AllMilestoneStats:v1";
        private const string MilestoneClaimRowsCacheKey = "MilestoneClaimRows:v1";
        private const string CacheContainerName = "cache";
        private const string MilestoneStatsBlobName = "milestone-stats.json";
        private const string AllMilestoneStatsBlobName = "all-milestone-stats.json";
        private const string MilestoneClaimRowsBlobName = "milestone-claim-rows.json";

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

        public async Task<List<MilestoneStats>> GetAllMilestoneStatsAsync()
        {
            if (Cache.TryGetValue(AllMilestoneStatsCacheKey, out List<MilestoneStats> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} all milestone stats from memory cache");
                return cached;
            }

            // Try cross-instance blob cache
            var blobList = await TryReadAllMilestoneStatsFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    AllMilestoneStatsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} all milestone stats from blob cache");
                return blobList;
            }

            var list = await ComputeAllMilestoneStatsFromDbAsync();

            // Memory cache for 24h
            Cache.Set(
                AllMilestoneStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            // Write to blob for cross-instance warm cache
            await TryWriteAllMilestoneStatsToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} all milestone stats");
            return list;
        }

        public async Task RefreshAllMilestoneStatsCacheAsync()
        {
            var list = await ComputeAllMilestoneStatsFromDbAsync();

            Cache.Set(
                AllMilestoneStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteAllMilestoneStatsToBlobAsync(list);

            _logger.LogInformation($"Refreshed all milestone stats cache with {list.Count} rows");
        }

        private async Task<List<MilestoneStats>> ComputeAllMilestoneStatsFromDbAsync()
        {
            var sql = @"
WITH best_g AS (
    SELECT g.TableId, g.Map, g.PreludeOn, g.ColoniesOn, g.DraftOn,
           g.GameMode, g.GameSpeed,
           rn = ROW_NUMBER() OVER (
               PARTITION BY g.TableId
               ORDER BY g.IndexedAt DESC, g.Id DESC   -- pick the most recent row per game
           )
    FROM Games g
),
best_gp AS (
    SELECT gp.TableId, gp.PlayerId,
           gp.PlayerName, gp.Elo, gp.EloChange, gp.Position,
           rn = ROW_NUMBER() OVER (
               PARTITION BY gp.TableId, gp.PlayerId
               ORDER BY gp.GameId DESC                -- pick latest row per player in game
           )
    FROM GamePlayers gp
),
milestone_claims AS (
    SELECT 
        gm.Milestone,
        COUNT(*) as TimesClaimed,
        AVG(CAST(CASE WHEN gp.Position = 1 THEN 1.0 ELSE 0.0 END AS float)) as WinRate,
        AVG(CAST(ISNULL(gp.EloChange, 0) AS float)) as AvgEloGain,
        AVG(CAST(gm.ClaimedGen AS float)) as AvgGenClaimed,
        AVG(CAST(ISNULL(gp.Elo, 0) AS float)) as AvgElo
    FROM GameMilestones gm
    JOIN best_g g ON g.TableId = gm.TableId AND g.rn = 1
    JOIN best_gp gp ON gp.TableId = gm.TableId AND gp.PlayerId = gm.ClaimedBy AND gp.rn = 1
    WHERE gm.Milestone IS NOT NULL AND gm.Milestone <> ''
    GROUP BY gm.Milestone
)
SELECT 
    Milestone as Name,
    TimesClaimed,
    WinRate,
    AvgEloGain,
    AvgGenClaimed,
    AvgElo
FROM milestone_claims
ORDER BY WinRate DESC;";

            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            var rows = await conn.QueryAsync<MilestoneStats>(sql, commandTimeout: 300); // 5 minutes
            var result = rows.ToList();

            // Apply name formatting in C# after fetching data
            foreach (var milestone in result)
            {
                milestone.Name = FormatMilestoneName(milestone.Name);
            }

            return result;
        }

        private static string FormatMilestoneName(string rawName)
        {
            if (string.IsNullOrEmpty(rawName))
                return rawName;

            // Handle special cases first
            if (rawName == "POLAR")
                return "Polar Explorer";
            if (rawName == "RIM")
                return "Rim Settler";

            // Convert to proper case: first letter uppercase, rest lowercase for each word
            var words = rawName.Split('_', ' ', '-');
            var formattedWords = words.Select(word => 
                string.IsNullOrEmpty(word) ? word : 
                char.ToUpper(word[0]) + word.Substring(1).ToLower()
            );
            
            return string.Join(" ", formattedWords);
        }

        private async Task<List<MilestoneStats>> TryReadAllMilestoneStatsFromBlobAsync()
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
                var blob = container.GetBlobClient(AllMilestoneStatsBlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<MilestoneStats>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read all milestone stats from blob cache");
                return null;
            }
        }

        private async Task TryWriteAllMilestoneStatsToBlobAsync(List<MilestoneStats> list)
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
                var blob = container.GetBlobClient(AllMilestoneStatsBlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write all milestone stats to blob cache");
            }
        }

        public async Task<List<MilestoneClaimRow>> GetAllMilestoneClaimRowsAsync()
        {
            if (Cache.TryGetValue(MilestoneClaimRowsCacheKey, out List<MilestoneClaimRow> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} milestone claim rows from memory cache");
                return cached;
            }

            // Try cross-instance blob cache
            var blobList = await TryReadMilestoneClaimRowsFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    MilestoneClaimRowsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} milestone claim rows from blob cache");
                return blobList;
            }

            var list = await ComputeMilestoneClaimRowsFromDbAsync();

            // Memory cache for 24h
            Cache.Set(
                MilestoneClaimRowsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            // Write to blob for cross-instance warm cache
            await TryWriteMilestoneClaimRowsToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} milestone claim rows");
            return list;
        }

        public async Task RefreshMilestoneClaimRowsCacheAsync()
        {
            var list = await ComputeMilestoneClaimRowsFromDbAsync();

            Cache.Set(
                MilestoneClaimRowsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteMilestoneClaimRowsToBlobAsync(list);

            _logger.LogInformation($"Refreshed milestone claim rows cache with {list.Count} rows");
        }

        private async Task<List<MilestoneClaimRow>> ComputeMilestoneClaimRowsFromDbAsync()
        {
            var sql = @"
WITH best_g AS (
    SELECT g.TableId, g.Map, g.PreludeOn, g.ColoniesOn, g.DraftOn,
           g.GameMode, g.GameSpeed,
           rn = ROW_NUMBER() OVER (
               PARTITION BY g.TableId
               ORDER BY g.IndexedAt DESC, g.Id DESC   -- pick the most recent row per game
           )
    FROM Games g
),
best_gp AS (
    SELECT gp.TableId, gp.PlayerId,
           gp.PlayerName, gp.Elo, gp.EloChange, gp.Position,
           rn = ROW_NUMBER() OVER (
               PARTITION BY gp.TableId, gp.PlayerId
               ORDER BY gp.GameId DESC                -- pick latest row per player in game
           )
    FROM GamePlayers gp
)
SELECT
    gm.TableId,
    g.Map,
    g.PreludeOn,
    g.ColoniesOn,
    g.DraftOn,
    g.GameMode,
    g.GameSpeed,
    gs.PlayerCount,
    gs.DurationMinutes,
    gs.Generations,    
    gm.Milestone,
    gm.ClaimedGen,
    gp.PlayerId,
    gp.PlayerName,
    gp.Elo,
    gp.EloChange,
    gp.Position,
    gps.Corporation
FROM GameMilestones gm
JOIN best_g g
  ON g.TableId = gm.TableId AND g.rn = 1
JOIN best_gp gp
  ON gp.TableId = gm.TableId
 AND gp.PlayerId = gm.ClaimedBy
 AND gp.rn = 1
JOIN GamePlayerStats gps
  ON gps.TableId = gm.TableId
 AND gps.PlayerId = gm.ClaimedBy
JOIN GameStats gs
  ON gs.TableId = gm.TableId
WHERE gm.Milestone IS NOT NULL AND gm.Milestone <> ''
ORDER BY gm.TableId DESC;";

            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            var rows = await conn.QueryAsync<MilestoneClaimRow>(sql, commandTimeout: 300); // 5 minutes
            var result = rows.ToList();

            // Apply name formatting in C# after fetching data
            foreach (var milestone in result)
            {
                milestone.Milestone = FormatMilestoneName(milestone.Milestone);
            }

            return result;
        }

        private async Task<List<MilestoneClaimRow>> TryReadMilestoneClaimRowsFromBlobAsync()
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
                var blob = container.GetBlobClient(MilestoneClaimRowsBlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<MilestoneClaimRow>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read milestone claim rows from blob cache");
                return null;
            }
        }

        private async Task TryWriteMilestoneClaimRowsToBlobAsync(List<MilestoneClaimRow> list)
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
                var blob = container.GetBlobClient(MilestoneClaimRowsBlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write milestone claim rows to blob cache");
            }
        }
    }
}
