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
    public class CorporationStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string AllCorporationStatsCacheKey = "AllCorporationPlayerStats:v2";
        private const string CacheContainerName = "cache";
        private const string BlobName = "corporation-player-stats.json";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public CorporationStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public class CorporationPlayerStatsRow
        {
            public int TableId { get; set; }
            public string Map { get; set; }
            public bool PreludeOn { get; set; }
            public bool ColoniesOn { get; set; }
            public bool DraftOn { get; set; }
            public string GameMode { get; set; }
            public string GameSpeed { get; set; }
            public int? PlayerCount { get; set; }
            public int? DurationMinutes { get; set; }
            public int? Generations { get; set; }
            public string Corporation { get; set; }
            public int? FinalScore { get; set; }
            public int? FinalTr { get; set; }
            public int? GreeneryPoints { get; set; }
            public int? CityPoints { get; set; }
            public int? MilestonePoints { get; set; }
            public int? AwardPoints { get; set; }
            public int? CardPoints { get; set; }
            public int PlayerId { get; set; }
            public string PlayerName { get; set; }
            public int? Elo { get; set; }
            public int? EloChange { get; set; }
            public int? Position { get; set; }
        }

        public class CorpFilter
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
        }

        public class CorpRanking
        {
            public string Corporation { get; set; }
            public double WinRate { get; set; }
            public double AvgEloGain { get; set; }
            public int GamesPlayed { get; set; }
            public double AvgElo { get; set; }
        }

        private static string BuildRankingsCacheKey(CorpFilter f)
        {
            string Join(string[] arr) => arr == null ? "" : string.Join(",", arr.OrderBy(x => x ?? string.Empty));
            string JoinInt(int[] arr) => arr == null ? "" : string.Join(",", arr.OrderBy(x => x));
            string B(bool? b) => b.HasValue ? (b.Value ? "1" : "0") : "";
            string N(int? n) => n.HasValue ? n.Value.ToString() : "";
            f ??= new CorpFilter();
            var key = $"CorpRankings:v1|maps={Join(f.Maps)}|prelude={B(f.PreludeOn)}|colonies={B(f.ColoniesOn)}|draft={B(f.DraftOn)}|modes={Join(f.Modes)}|speeds={Join(f.Speeds)}|pc={JoinInt(f.PlayerCounts)}|eloMin={N(f.EloMin)}|eloMax={N(f.EloMax)}|genMin={N(f.GenerationsMin)}|genMax={N(f.GenerationsMax)}|tpMin={N(f.TimesPlayedMin)}|tpMax={N(f.TimesPlayedMax)}|player={f.PlayerName?.Trim().ToLowerInvariant() ?? ""}";
            return key;
        }

        public async Task<List<CorpRanking>> GetCorporationRankingsAsync(CorpFilter filter)
        {
            // Try memory cache first
            var cacheKey = BuildRankingsCacheKey(filter);
            if (Cache.TryGetValue(cacheKey, out List<CorpRanking> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} corporation rankings from memory cache for key {cacheKey}");
                return cached;
            }

            var rows = await GetAllCorporationPlayerStatsAsync();
            IEnumerable<CorporationPlayerStatsRow> q = rows;

            if (filter != null)
            {
                if (filter.Maps != null && filter.Maps.Length > 0)
                    q = q.Where(r => !string.IsNullOrEmpty(r.Map) && filter.Maps.Contains(r.Map));
                if (filter.PreludeOn.HasValue)
                    q = q.Where(r => r.PreludeOn == filter.PreludeOn.Value);
                if (filter.ColoniesOn.HasValue)
                    q = q.Where(r => r.ColoniesOn == filter.ColoniesOn.Value);
                if (filter.DraftOn.HasValue)
                    q = q.Where(r => r.DraftOn == filter.DraftOn.Value);
                if (filter.Modes != null && filter.Modes.Length > 0)
                    q = q.Where(r => !string.IsNullOrEmpty(r.GameMode) && filter.Modes.Contains(r.GameMode));
                if (filter.Speeds != null && filter.Speeds.Length > 0)
                    q = q.Where(r => !string.IsNullOrEmpty(r.GameSpeed) && filter.Speeds.Contains(r.GameSpeed));
                if (filter.PlayerCounts != null && filter.PlayerCounts.Length > 0)
                    q = q.Where(r => r.PlayerCount.HasValue && filter.PlayerCounts.Contains(r.PlayerCount.Value));
                if (filter.EloMin.HasValue)
                    q = q.Where(r => r.Elo.HasValue && r.Elo.Value >= filter.EloMin.Value);
                if (filter.EloMax.HasValue)
                    q = q.Where(r => r.Elo.HasValue && r.Elo.Value <= filter.EloMax.Value);
                if (filter.GenerationsMin.HasValue)
                    q = q.Where(r => r.Generations.HasValue && r.Generations.Value >= filter.GenerationsMin.Value);
                if (filter.GenerationsMax.HasValue)
                    q = q.Where(r => r.Generations.HasValue && r.Generations.Value <= filter.GenerationsMax.Value);
                if (!string.IsNullOrWhiteSpace(filter.PlayerName))
                    q = q.Where(r => !string.IsNullOrEmpty(r.PlayerName) && r.PlayerName.Contains(filter.PlayerName, StringComparison.OrdinalIgnoreCase));
            }

            var rankings = q
                .GroupBy(r => r.Corporation)
                .Select(g =>
                {
                    var games = g.Count();
                    var wins = g.Count(r => r.Position == 1);
                    var avgEloGain = g.Select(r => (double)(r.EloChange ?? 0)).DefaultIfEmpty(0).Average();
                    var avgElo = g.Select(r => (double)(r.Elo ?? 0)).DefaultIfEmpty(0).Average();
                    return new CorpRanking
                    {
                        Corporation = g.Key,
                        WinRate = games == 0 ? 0.0 : (double)wins / games * 100.0,
                        AvgEloGain = avgEloGain,
                        GamesPlayed = games,
                        AvgElo = avgElo
                    };
                })
                .ToList();

            if (filter?.TimesPlayedMin.HasValue == true)
                rankings = rankings.Where(r => r.GamesPlayed >= filter.TimesPlayedMin.Value).ToList();
            if (filter?.TimesPlayedMax.HasValue == true)
                rankings = rankings.Where(r => r.GamesPlayed <= filter.TimesPlayedMax.Value).ToList();

            // Default order by WinRate desc, then GamesPlayed desc
            rankings = rankings
                .OrderByDescending(r => r.WinRate)
                .ThenByDescending(r => r.GamesPlayed)
                .ToList();

            Cache.Set(cacheKey, rankings, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30) });
            _logger.LogInformation($"Computed and cached {rankings.Count} corporation rankings for key {cacheKey}");

            return rankings;
        }

        public async Task<List<CorporationPlayerStatsRow>> GetAllCorporationPlayerStatsAsync()
        {
            if (Cache.TryGetValue(AllCorporationStatsCacheKey, out List<CorporationPlayerStatsRow> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} corporation stats from memory cache");
                return cached;
            }

            // Try cross-instance blob cache
            var blobList = await TryReadFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    AllCorporationStatsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} corporation stats from blob cache");
                return blobList;
            }

            var list = await ComputeFromDbAsync();

            // Memory cache for 24h
            Cache.Set(
                AllCorporationStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            // Write to blob for cross-instance warm cache
            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} corporation stats");
            return list;
        }

        public async Task RefreshAllCorporationStatsCacheAsync()
        {
            var list = await ComputeFromDbAsync();

            Cache.Set(
                AllCorporationStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Refreshed corporation stats cache with {list.Count} rows");
        }

        private async Task<List<CorporationPlayerStatsRow>> ComputeFromDbAsync()
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
    gs.TableId,
    g.Map,
    g.PreludeOn,
    g.ColoniesOn,
    g.DraftOn,
    g.GameMode,
    g.GameSpeed,
    gs.PlayerCount,
    gs.DurationMinutes,
    gs.Generations,    
    gps.FinalScore,
    gps.FinalTr,
    gps.GreeneryPoints,
    gps.CityPoints,
    gps.MilestonePoints,
    gps.AwardPoints,
    gps.CardPoints,
    gps.PlayerId,
    gp.PlayerName,
    gp.Elo,
    gp.EloChange,
    gp.Position,
    gps.Corporation
FROM GamePlayerStats gps
JOIN GameStats gs
  ON gs.TableId = gps.TableId
JOIN best_g g
  ON g.TableId = gps.TableId AND g.rn = 1
JOIN best_gp gp
  ON gp.TableId = gps.TableId
 AND gp.PlayerId = gps.PlayerId
 AND gp.rn = 1
WHERE gps.Corporation <> 'Unknown'
ORDER BY gs.TableId DESC;";

            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            var rows = await conn.QueryAsync<CorporationPlayerStatsRow>(sql, commandTimeout: 600); // 10 minutes
            return rows.ToList();
        }

        private async Task<List<CorporationPlayerStatsRow>> TryReadFromBlobAsync()
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
                var list = JsonSerializer.Deserialize<List<CorporationPlayerStatsRow>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read corporation stats from blob cache");
                return null;
            }
        }

        private async Task TryWriteToBlobAsync(List<CorporationPlayerStatsRow> list)
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
                _logger.LogWarning(ex, "Failed to write corporation stats to blob cache");
            }
        }
    }
}
