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
    public class PlayerScoreService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string PlayerScoresCacheKey = "PlayerScores:v1";
        private const string CacheContainerName = "cache";
        private const string PlayerScoresBlobName = "player-scores.json";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public PlayerScoreService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<List<PlayerScore>> GetPlayerScoresAsync()
        {
            if (Cache.TryGetValue(PlayerScoresCacheKey, out List<PlayerScore> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} player scores from cache");
                return cached;
            }

            // Try read from blob cross-instance cache
            var blobList = await TryReadFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    PlayerScoresCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} player scores from blob cache");
                return blobList;
            }

            var list = await ComputePlayerScoresFromDbAsync();

            // Cache for 24 hours
            Cache.Set(
                PlayerScoresCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            // Write to blob for cross-instance warm cache
            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} player scores");
            return list;
        }

        public async Task RefreshPlayerScoresCacheAsync()
        {
            var list = await ComputePlayerScoresFromDbAsync();

            Cache.Set(
                PlayerScoresCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Refreshed player scores cache with {list.Count} rows");
        }

        private async Task<List<PlayerScore>> ComputePlayerScoresFromDbAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                /* One row per (TableId, PlayerId). No WHERE filters — export everything. */
                ;WITH BestStats AS (
                  -- Deduplicate GamePlayerStats: keep highest FinalScore per player+game.
                  SELECT
                      gps.TableId,
                      gps.PlayerId,
                      FinalScore   = MAX(gps.FinalScore),
                      Corporation  = MAX(gps.Corporation)
                  FROM dbo.GamePlayerStats AS gps
                  WHERE gps.Corporation <> 'Unknown'
                  GROUP BY gps.TableId, gps.PlayerId
                ),
                BestPlayers AS (
                  -- Deduplicate GamePlayers if needed
                  SELECT
                      gp.TableId,
                      gp.PlayerId,
                      PlayerName = MAX(gp.PlayerName),
                      Elo        = MAX(gp.Elo)
                  FROM dbo.GamePlayers AS gp
                  GROUP BY gp.TableId, gp.PlayerId
                ),
                OneGame AS (
                  -- Pick exactly one Games row per TableId to avoid multiplying by PlayerPerspective
                  SELECT
                      g.TableId,
                      g.Map,
                      g.ColoniesOn,
                      g.GameMode,
                      g.GameSpeed,
                      g.PreludeOn,
                      g.DraftOn,
                      rn = ROW_NUMBER() OVER (PARTITION BY g.TableId ORDER BY g.PlayerPerspective)
                  FROM dbo.Games AS g
                )
                SELECT
                    bs.TableId,
                    bs.PlayerId,
                    COALESCE(p.Name, bp.PlayerName) AS PlayerName,
                    bp.Elo,
                    bs.Corporation,
                    og.Map,
                    og.ColoniesOn,
                    og.GameMode,
                    og.GameSpeed,
                    og.PreludeOn,
                    og.DraftOn,
                    gs.Generations,
                    gs.PlayerCount,
                    bs.FinalScore
                FROM BestStats bs
                LEFT JOIN BestPlayers bp ON bp.TableId = bs.TableId AND bp.PlayerId = bs.PlayerId
                LEFT JOIN dbo.Players  p ON p.PlayerId = bs.PlayerId
                JOIN OneGame og ON og.TableId = bs.TableId AND og.rn = 1
                LEFT JOIN dbo.GameStats gs ON gs.TableId = bs.TableId";

            var results = await connection.QueryAsync<PlayerScore>(query, commandTimeout: 300); // 5 minutes
            return results.ToList();
        }

        private async Task<List<PlayerScore>> TryReadFromBlobAsync()
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
                var blob = container.GetBlobClient(PlayerScoresBlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<PlayerScore>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read player scores from blob cache");
                return null;
            }
        }

        private async Task TryWriteToBlobAsync(List<PlayerScore> list)
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
                var blob = container.GetBlobClient(PlayerScoresBlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write player scores to blob cache");
            }
        }
    }
}
