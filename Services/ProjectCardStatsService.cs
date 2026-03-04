using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using Dapper;
using System.Text.Json;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using System.IO;
using System.Text;

namespace BgaTmScraperRegistry.Services
{
    public class ProjectCardStatsService
    {
        private const string CacheContainerName = "cache";
        private const string CardPlayerStatsBlobPrefix = "card-player-stats/";
        private static readonly TimeSpan CacheExpiry = TimeSpan.FromDays(3);
        private const int QueryTimeoutSeconds = 60;

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public ProjectCardStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public class ProjectCardPlayerStatsRow
        {
            public int TableId { get; set; }
            public int PlayerId { get; set; }
            public string Map { get; set; }
            public string GameMode { get; set; }
            public string GameSpeed { get; set; }
            public bool PreludeOn { get; set; }
            public bool ColoniesOn { get; set; }
            public bool DraftOn { get; set; }
            public int? SeenGen { get; set; }
            public int? DrawnGen { get; set; }
            public int? KeptGen { get; set; }
            public int? DraftedGen { get; set; }
            public int? BoughtGen { get; set; }
            public int? PlayedGen { get; set; }
            public string DrawType { get; set; }
            public string DrawReason { get; set; }
            public int? VpScored { get; set; }
            public string PlayerName { get; set; }
            public int? Elo { get; set; }
            public int? EloChange { get; set; }
            public int? Position { get; set; }
            public int? PlayerCount { get; set; }
        }

        public async Task<List<ProjectCardPlayerStatsRow>> GetCardPlayerStatsAsync(string cardName)
        {
            // Try to read from blob cache first
            var cachedData = await TryReadFromBlobAsync(cardName);
            if (cachedData != null)
            {
                _logger.LogInformation($"Returning {cachedData.Count} player stats for card '{cardName}' from blob cache");
                return cachedData;
            }

            // Cache miss or expired - query database
            _logger.LogInformation($"Cache miss for card '{cardName}', querying database...");
            var data = await QueryCardPlayerStatsFromDbAsync(cardName);

            // Store in blob cache
            await TryWriteToBlobAsync(cardName, data);

            _logger.LogInformation($"Retrieved and cached {data.Count} player stats for card '{cardName}'");
            return data;
        }

        private async Task<List<ProjectCardPlayerStatsRow>> QueryCardPlayerStatsFromDbAsync(string cardName)
        {
            var sql = @"
-- 1) Keys you need (only once per player/table)
WITH keys AS (
  SELECT DISTINCT gc.TableId, gc.PlayerId
  FROM GameCards gc WITH (NOLOCK)
  WHERE gc.Card = @CardName AND gc.PlayedGen IS NOT NULL
)

-- 2) Pick one row from GamePlayers_Canonical and Games for each key
, best_gp AS (
  SELECT k.TableId, k.PlayerId,
         gp.PlayerName, gp.Elo, gp.EloChange, gp.Position
  FROM keys k
  JOIN GamePlayers_Canonical gp WITH (NOLOCK)
    ON gp.TableId = k.TableId AND gp.PlayerId = k.PlayerId
)
, best_g AS (
  -- choose a canonical row per TableId (fast & player-agnostic)
  SELECT g.TableId, g.Map, g.GameMode, g.GameSpeed, g.PreludeOn, g.ColoniesOn, g.DraftOn,
         ROW_NUMBER() OVER (
           PARTITION BY g.TableId
           ORDER BY g.IndexedAt DESC, g.Id DESC
         ) AS rn
  FROM (SELECT DISTINCT TableId FROM keys) t
  JOIN Games g WITH (NOLOCK) ON g.TableId = t.TableId
)

SELECT
    gc.TableId,
    gc.PlayerId,
    g.Map, g.GameMode, g.GameSpeed, g.PreludeOn, g.ColoniesOn, g.DraftOn,
    gc.SeenGen, gc.DrawnGen, gc.KeptGen, gc.DraftedGen, gc.BoughtGen,
    gc.PlayedGen, gc.DrawType, gc.DrawReason, gc.VpScored,
    gp.PlayerName, gp.Elo, gp.EloChange, gp.Position,
    gs.PlayerCount
FROM GameCards gc WITH (NOLOCK)
JOIN best_gp gp
  ON gp.TableId = gc.TableId AND gp.PlayerId = gc.PlayerId
JOIN (SELECT * FROM best_g  WHERE rn = 1) g
  ON g.TableId = gc.TableId
JOIN GameStats gs WITH (NOLOCK)
  ON gs.TableId = gc.TableId
WHERE gc.Card = (@CardName)
  AND gc.PlayedGen IS NOT NULL;";

            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            var rows = await conn.QueryAsync<ProjectCardPlayerStatsRow>(
                sql,
                new { CardName = cardName },
                commandTimeout: QueryTimeoutSeconds
            );

            return rows.AsList();
        }

        private async Task<List<ProjectCardPlayerStatsRow>> TryReadFromBlobAsync(string cardName)
        {
            try
            {
                var blobConn = Environment.GetEnvironmentVariable("BlobStorageConnectionString");
                if (string.IsNullOrWhiteSpace(blobConn))
                {
                    _logger.LogWarning("BlobStorageConnectionString not configured, skipping blob cache");
                    return null;
                }

                var service = new BlobServiceClient(blobConn);
                var container = service.GetBlobContainerClient(CacheContainerName);
                var blobName = GetBlobName(cardName);
                var blob = container.GetBlobClient(blobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    _logger.LogInformation($"Blob cache miss for card '{cardName}' - blob does not exist");
                    return null;
                }

                // Check if blob is expired
                var properties = await blob.GetPropertiesAsync();
                var lastModified = properties.Value.LastModified;
                var age = DateTimeOffset.UtcNow - lastModified;

                if (age > CacheExpiry)
                {
                    _logger.LogInformation($"Blob cache expired for card '{cardName}' - age: {age.TotalDays:F1} days (max: {CacheExpiry.TotalDays} days)");
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<ProjectCardPlayerStatsRow>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                _logger.LogInformation($"Blob cache hit for card '{cardName}' - age: {age.TotalHours:F1} hours");
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, $"Failed to read card player stats from blob cache for card '{cardName}'");
                return null;
            }
        }

        private async Task TryWriteToBlobAsync(string cardName, List<ProjectCardPlayerStatsRow> data)
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

                var blobName = GetBlobName(cardName);
                var blob = container.GetBlobClient(blobName);

                var json = JsonSerializer.Serialize(data);
                using var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });

                _logger.LogInformation($"Wrote {data.Count} player stats to blob cache for card '{cardName}'");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, $"Failed to write card player stats to blob cache for card '{cardName}'");
            }
        }

        private static string GetBlobName(string cardName)
        {
            // Sanitize card name for use in blob path
            var safeName = cardName
                .Replace("/", "_")
                .Replace("\\", "_")
                .Replace(":", "_")
                .Replace("*", "_")
                .Replace("?", "_")
                .Replace("\"", "_")
                .Replace("<", "_")
                .Replace(">", "_")
                .Replace("|", "_");

            return $"{CardPlayerStatsBlobPrefix}{safeName}.json";
        }
    }
}
