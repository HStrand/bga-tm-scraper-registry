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
    gps.Corporation,  
    gps.FinalScore,
    gps.FinalTr,
    gps.GreeneryPoints,
    gps.CityPoints,
    gps.MilestonePoints,
    gps.AwardPoints,
    gps.CardPoints,
    gps.PlayerId,
    gp.PlayerName AS PlayerName,
    gp.Elo,
    gp.EloChange,
    gp.Position
FROM GamePlayerStats gps WITH (NOLOCK)
INNER JOIN Games g WITH (NOLOCK) ON gps.TableId = g.TableId
INNER JOIN GameStats gs WITH (NOLOCK) ON gs.TableId = gps.TableId
INNER JOIN GamePlayers gp WITH (NOLOCK) ON gp.TableId = gs.TableId AND gp.PlayerId = gps.PlayerId
WHERE gps.Corporation <> 'Unknown'
ORDER BY gs.TableId DESC";

            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            var rows = await conn.QueryAsync<CorporationPlayerStatsRow>(sql, commandTimeout: 300); // 5 minutes
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
