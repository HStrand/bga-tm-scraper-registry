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

        public class ScoreFilter
        {
            public string[] Maps { get; set; }
            public string[] Modes { get; set; }
            public string[] Speeds { get; set; }
            public int[] PlayerCounts { get; set; }
            public bool? PreludeOn { get; set; }
            public bool? ColoniesOn { get; set; }
            public bool? DraftOn { get; set; }
            public int? EloMin { get; set; }
            public int? EloMax { get; set; }
            public int? GenerationsMin { get; set; }
            public int? GenerationsMax { get; set; }
            public string PlayerName { get; set; }
            public string Corporation { get; set; }
        }

        public class ScoreFilterOptions
        {
            public string[] Maps { get; set; }
            public string[] GameModes { get; set; }
            public string[] GameSpeeds { get; set; }
            public int[] PlayerCounts { get; set; }
            public string[] Corporations { get; set; }
            public Range EloRange { get; set; }
            public Range GenerationsRange { get; set; }

            public class Range
            {
                public int Min { get; set; }
                public int Max { get; set; }
            }
        }

        private static string BuildScoresCacheKey(ScoreFilter f, int limit)
        {
            string Join(string[] arr) => arr == null ? "" : string.Join(",", arr.OrderBy(x => x ?? string.Empty));
            string JoinInt(int[] arr) => arr == null ? "" : string.Join(",", arr.OrderBy(x => x));
            string B(bool? b) => b.HasValue ? (b.Value ? "1" : "0") : "";
            string N(int? n) => n.HasValue ? n.Value.ToString() : "";
            f ??= new ScoreFilter();
            var key = $"HighScores:v1|maps={Join(f.Maps)}|modes={Join(f.Modes)}|speeds={Join(f.Speeds)}|pc={JoinInt(f.PlayerCounts)}|prelude={B(f.PreludeOn)}|colonies={B(f.ColoniesOn)}|draft={B(f.DraftOn)}|eloMin={N(f.EloMin)}|eloMax={N(f.EloMax)}|genMin={N(f.GenerationsMin)}|genMax={N(f.GenerationsMax)}|player={f.PlayerName?.Trim().ToLowerInvariant() ?? ""}|corp={f.Corporation?.Trim().ToLowerInvariant() ?? ""}|limit={limit}";
            return key;
        }

        public async Task<ScoreFilterOptions> GetScoreFilterOptionsAsync()
        {
            // Build options from cached full list to keep payload small client-side
            var rows = await GetPlayerScoresAsync();

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

            var corporations = rows.Where(r => !string.IsNullOrWhiteSpace(r.Corporation))
                                   .Select(r => r.Corporation)
                                   .Distinct(StringComparer.OrdinalIgnoreCase)
                                   .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
                                   .ToArray();

            // Treat Elo <= 0 as "missing"
            var eloVals = rows.Select(r => r.Elo).Where(e => e > 0).ToArray();
            var genVals = rows.Where(r => r.Generations.HasValue).Select(r => r.Generations!.Value).ToArray();

            return new ScoreFilterOptions
            {
                Maps = maps,
                GameModes = modes,
                GameSpeeds = speeds,
                PlayerCounts = playerCounts,
                Corporations = corporations,
                EloRange = new ScoreFilterOptions.Range
                {
                    Min = eloVals.Length > 0 ? eloVals.Min() : 0,
                    Max = eloVals.Length > 0 ? eloVals.Max() : 0
                },
                GenerationsRange = new ScoreFilterOptions.Range
                {
                    Min = genVals.Length > 0 ? genVals.Min() : 0,
                    Max = genVals.Length > 0 ? genVals.Max() : 0
                }
            };
        }

        public async Task<List<PlayerScore>> GetPlayerScoresFilteredAsync(ScoreFilter filter, int limit = 25)
        {
            // Try memory cache for filtered result
            var cacheKey = BuildScoresCacheKey(filter, limit);
            if (Cache.TryGetValue(cacheKey, out List<PlayerScore> cached))
            {
                _logger.LogInformation("Returning high scores from memory cache with key {key}", cacheKey);
                return cached;
            }

            var rows = await GetPlayerScoresAsync();
            IEnumerable<PlayerScore> q = rows;

            if (filter != null)
            {
                if (filter.Maps != null && filter.Maps.Length > 0)
                    q = q.Where(r => !string.IsNullOrEmpty(r.Map) && filter.Maps.Contains(r.Map));
                if (filter.Modes != null && filter.Modes.Length > 0)
                    q = q.Where(r => !string.IsNullOrEmpty(r.GameMode) && filter.Modes.Contains(r.GameMode));
                if (filter.Speeds != null && filter.Speeds.Length > 0)
                    q = q.Where(r => !string.IsNullOrEmpty(r.GameSpeed) && filter.Speeds.Contains(r.GameSpeed));
                if (filter.PlayerCounts != null && filter.PlayerCounts.Length > 0)
                    q = q.Where(r => r.PlayerCount.HasValue && filter.PlayerCounts.Contains(r.PlayerCount.Value));

                if (filter.PreludeOn.HasValue)
                    q = q.Where(r => r.PreludeOn == filter.PreludeOn.Value);
                if (filter.ColoniesOn.HasValue)
                    q = q.Where(r => r.ColoniesOn == filter.ColoniesOn.Value);
                if (filter.DraftOn.HasValue)
                    q = q.Where(r => r.DraftOn == filter.DraftOn.Value);

                // Elo range; treat 0 or less as "missing"
                if (filter.EloMin.HasValue)
                    q = q.Where(r => r.Elo > 0 && r.Elo >= filter.EloMin.Value);
                if (filter.EloMax.HasValue)
                    q = q.Where(r => r.Elo > 0 && r.Elo <= filter.EloMax.Value);

                if (filter.GenerationsMin.HasValue)
                    q = q.Where(r => r.Generations.HasValue && r.Generations.Value >= filter.GenerationsMin.Value);
                if (filter.GenerationsMax.HasValue)
                    q = q.Where(r => r.Generations.HasValue && r.Generations.Value <= filter.GenerationsMax.Value);

                if (!string.IsNullOrWhiteSpace(filter.PlayerName))
                    q = q.Where(r => !string.IsNullOrEmpty(r.PlayerName) && r.PlayerName.Contains(filter.PlayerName, StringComparison.OrdinalIgnoreCase));

                if (!string.IsNullOrWhiteSpace(filter.Corporation))
                    q = q.Where(r => !string.IsNullOrEmpty(r.Corporation) && r.Corporation.Equals(filter.Corporation, StringComparison.OrdinalIgnoreCase));
            }

            var list = q
                .OrderByDescending(r => r.FinalScore)
                .ThenByDescending(r => r.Elo) // stabilize ties by Elo if available
                .Take(Math.Max(1, Math.Min(limit, 100)))
                .ToList();

            Cache.Set(cacheKey, list, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30) });
            _logger.LogInformation("Computed and cached {count} filtered high scores for key {key}", list.Count, cacheKey);

            return list;
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
