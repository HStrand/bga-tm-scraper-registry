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
    public class ParameterStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string ParameterStatsCacheKey = "ParameterStats:v1";
        private const string CacheContainerName = "cache";
        private const string ParameterStatsBlobName = "parameter-stats.json";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public ParameterStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<List<PlayerParameterStats>> GetPlayerParameterStatsAsync()
        {
            if (Cache.TryGetValue(ParameterStatsCacheKey, out List<PlayerParameterStats> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} parameter stats from cache");
                return cached;
            }

            // Try read from blob cross-instance cache
            var blobList = await TryReadFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    ParameterStatsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} parameter stats from blob cache");
                return blobList;
            }

            var list = await ComputeParameterStatsFromDbAsync();

            // Cache for 24 hours
            Cache.Set(
                ParameterStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            // Write to blob for cross-instance warm cache
            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} parameter stats");
            return list;
        }

        public async Task RefreshParameterStatsCacheAsync()
        {
            var list = await ComputeParameterStatsFromDbAsync();

            Cache.Set(
                ParameterStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Refreshed parameter stats cache with {list.Count} rows");
        }

        private async Task<List<PlayerParameterStats>> ComputeParameterStatsFromDbAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                ;WITH agg AS (
                  SELECT
                      gl.IncreasedBy,
                      ParameterIncreases = COUNT_BIG(*),
                      GameCount          = COUNT(DISTINCT gl.TableId)
                  FROM dbo.ParameterChanges AS gl
                  GROUP BY gl.IncreasedBy
                )
                SELECT
                    p.Name,
                    p.PlayerId,
                    a.ParameterIncreases,
                    a.GameCount,
                    ParameterIncreasesPerGame =
                      CAST(a.ParameterIncreases AS decimal(18,4)) / NULLIF(a.GameCount, 0)
                FROM agg AS a
                JOIN dbo.Players AS p
                  ON p.PlayerId = a.IncreasedBy
                WHERE a.GameCount >= 30
                ORDER BY ParameterIncreasesPerGame DESC;";

            var results = await connection.QueryAsync<PlayerParameterStats>(query, commandTimeout: 300); // 5 minutes
            return results.ToList();
        }

        private async Task<List<PlayerParameterStats>> TryReadFromBlobAsync()
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
                var blob = container.GetBlobClient(ParameterStatsBlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<PlayerParameterStats>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read parameter stats from blob cache");
                return null;
            }
        }

        private async Task TryWriteToBlobAsync(List<PlayerParameterStats> list)
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
                var blob = container.GetBlobClient(ParameterStatsBlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write parameter stats to blob cache");
            }
        }
    }
}
