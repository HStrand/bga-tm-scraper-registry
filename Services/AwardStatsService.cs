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
    public class AwardStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string AwardRowsCacheKey = "AwardRows:v2";
        private const string CacheContainerName = "cache";
        private const string AwardRowsBlobName = "award-rows-v2.json";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public AwardStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<List<AwardRow>> GetAllAwardRowsAsync()
        {
            if (Cache.TryGetValue(AwardRowsCacheKey, out List<AwardRow> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} award rows from memory cache");
                return cached;
            }

            // Try cross-instance blob cache
            var blobList = await TryReadAwardRowsFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    AwardRowsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} award rows from blob cache");
                return blobList;
            }

            var list = await ComputeAwardRowsFromDbAsync();

            // Memory cache for 24h
            Cache.Set(
                AwardRowsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            // Write to blob for cross-instance warm cache
            await TryWriteAwardRowsToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} award rows");
            return list;
        }

        public async Task RefreshAwardRowsCacheAsync()
        {
            var list = await ComputeAwardRowsFromDbAsync();

            Cache.Set(
                AwardRowsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteAwardRowsToBlobAsync(list);

            _logger.LogInformation($"Refreshed award rows cache with {list.Count} rows");
        }

        private async Task<List<AwardRow>> ComputeAwardRowsFromDbAsync()
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
best_gps AS (
    SELECT gps.TableId, gps.PlayerId, gps.Corporation,
           rn = ROW_NUMBER() OVER (
               PARTITION BY gps.TableId, gps.PlayerId
               ORDER BY gps.UpdatedAt DESC            -- pick latest GamePlayerStats per player in game
           )
    FROM GamePlayerStats gps
),
best_gpa AS (
    SELECT gpa.TableId, gpa.PlayerId, gpa.Award, gpa.FundedBy, gpa.FundedGen, gpa.PlayerCounter, gpa.PlayerPlace,
           rn = ROW_NUMBER() OVER (
               PARTITION BY gpa.TableId, gpa.PlayerId, gpa.Award
               ORDER BY gpa.UpdatedAt DESC            -- pick latest GamePlayerAward per player per award per game
           )
    FROM GamePlayerAwards gpa
)
SELECT
    gpa.TableId,
    g.Map,
    g.PreludeOn,
    g.ColoniesOn,
    g.DraftOn,
    g.GameMode,
    g.GameSpeed,
    gs.PlayerCount,
    gs.DurationMinutes,
    gs.Generations,    
    gpa.Award,
    gpa.FundedBy,
    gpa.FundedGen,
    gpa.PlayerId,
    gp.PlayerName,
    gp.Elo,
    gp.EloChange,
    gp.Position,
    gpa.PlayerCounter,
    gpa.PlayerPlace,
    gps.Corporation
FROM best_gpa gpa
JOIN best_g g
  ON g.TableId = gpa.TableId AND g.rn = 1
JOIN best_gp gp
  ON gp.TableId = gpa.TableId
 AND gp.PlayerId = gpa.PlayerId
 AND gp.rn = 1
JOIN best_gps gps
  ON gps.TableId = gpa.TableId
 AND gps.PlayerId = gpa.PlayerId
 AND gps.rn = 1
JOIN GameStats gs
  ON gs.TableId = gpa.TableId
WHERE gpa.Award IS NOT NULL AND gpa.Award <> '' AND gpa.rn = 1
ORDER BY gpa.TableId DESC;";

            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            var rows = await conn.QueryAsync<AwardRow>(sql, commandTimeout: 300); // 5 minutes
            var result = rows.ToList();

            // Apply name formatting in C# after fetching data
            foreach (var award in result)
            {
                award.Award = FormatAwardName(award.Award);
            }

            return result;
        }

        private static string FormatAwardName(string rawName)
        {
            if (string.IsNullOrEmpty(rawName))
                return rawName;

            // Convert to proper case: first letter uppercase, rest lowercase for each word
            var words = rawName.Split('_', ' ', '-');
            var formattedWords = words.Select(word => 
                string.IsNullOrEmpty(word) ? word : 
                char.ToUpper(word[0]) + word.Substring(1).ToLower()
            );
            
            return string.Join(" ", formattedWords);
        }

        private async Task<List<AwardRow>> TryReadAwardRowsFromBlobAsync()
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
                var blob = container.GetBlobClient(AwardRowsBlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<AwardRow>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read award rows from blob cache");
                return null;
            }
        }

        private async Task TryWriteAwardRowsToBlobAsync(List<AwardRow> list)
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
                var blob = container.GetBlobClient(AwardRowsBlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write award rows to blob cache");
            }
        }
    }
}
