using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using Azure.Storage.Blobs;
using Dapper;

namespace BgaTmScraperRegistry.Services
{
    public class TilePlacementService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string CacheContainerName = "cache";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        private static readonly Regex HexCoordsRegex = new Regex(
            @"(\d+)\s*,\s*(\d+)", RegexOptions.Compiled);

        public TilePlacementService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString;
            _logger = logger;
        }

        private static string NormalizeLocation(string raw)
        {
            var trimmed = raw.Trim();
            if (trimmed.IndexOf("Hex", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                var m = HexCoordsRegex.Match(trimmed);
                if (m.Success)
                    return $"Hex {m.Groups[1].Value},{m.Groups[2].Value}";
            }
            return trimmed;
        }

        private static readonly HashSet<string> ExcludedLocations = new(StringComparer.OrdinalIgnoreCase)
        {
            "Ganymede Colony", "Phobos Space Haven", "Hex", ""
        };

        private static bool ShouldInclude(string location)
        {
            return !ExcludedLocations.Contains(location)
                && !location.StartsWith("tile", StringComparison.OrdinalIgnoreCase);
        }

        // ── Cache keys & blob names ──────────────────────────

        private static string OverviewCacheKey(TileType t) => $"TilePlacement:Overview:{t}:v1";
        private static string ByGenCacheKey(TileType t) => $"TilePlacement:ByGen:{t}:v1";
        private static string OverviewBlobName(TileType t) => $"tile-placement-overview-{t.ToString().ToLowerInvariant()}-v1.json";
        private static string ByGenBlobName(TileType t) => $"tile-placement-bygen-{t.ToString().ToLowerInvariant()}-v1.json";

        // ── Public API (cached) ──────────────────────────────

        public async Task<Dictionary<string, List<TilePlacementOverview>>> GetAllOverviewsAsync(TileType tileType)
        {
            var cacheKey = OverviewCacheKey(tileType);
            if (Cache.TryGetValue(cacheKey, out Dictionary<string, List<TilePlacementOverview>> cached))
            {
                _logger.LogInformation("Returning {type} overview from memory cache", tileType);
                return cached;
            }

            var blobData = await TryReadFromBlobAsync<Dictionary<string, List<TilePlacementOverview>>>(OverviewBlobName(tileType));
            if (blobData != null)
            {
                Cache.Set(cacheKey, blobData, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation("Loaded {type} overview from blob cache", tileType);
                return blobData;
            }

            var result = await ComputeAllOverviewsAsync(tileType);
            Cache.Set(cacheKey, result, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
            await TryWriteToBlobAsync(OverviewBlobName(tileType), result);
            _logger.LogInformation("Computed and cached {type} overview", tileType);
            return result;
        }

        public async Task<Dictionary<string, List<TilePlacementByGen>>> GetAllByGenAsync(TileType tileType)
        {
            var cacheKey = ByGenCacheKey(tileType);
            if (Cache.TryGetValue(cacheKey, out Dictionary<string, List<TilePlacementByGen>> cached))
            {
                _logger.LogInformation("Returning {type} by-gen from memory cache", tileType);
                return cached;
            }

            var blobData = await TryReadFromBlobAsync<Dictionary<string, List<TilePlacementByGen>>>(ByGenBlobName(tileType));
            if (blobData != null)
            {
                Cache.Set(cacheKey, blobData, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation("Loaded {type} by-gen from blob cache", tileType);
                return blobData;
            }

            var result = await ComputeAllByGenAsync(tileType);
            Cache.Set(cacheKey, result, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
            await TryWriteToBlobAsync(ByGenBlobName(tileType), result);
            _logger.LogInformation("Computed and cached {type} by-gen", tileType);
            return result;
        }

        // ── Refresh (called by timer trigger) ────────────────

        public async Task RefreshCacheAsync(TileType tileType)
        {
            var overview = await ComputeAllOverviewsAsync(tileType);
            Cache.Set(OverviewCacheKey(tileType), overview, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
            await TryWriteToBlobAsync(OverviewBlobName(tileType), overview);

            var byGen = await ComputeAllByGenAsync(tileType);
            Cache.Set(ByGenCacheKey(tileType), byGen, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
            await TryWriteToBlobAsync(ByGenBlobName(tileType), byGen);

            _logger.LogInformation("Refreshed {type} tile placement cache (overview + by-gen)", tileType);
        }

        // ── Compute from DB ──────────────────────────────────

        private async Task<Dictionary<string, List<TilePlacementOverview>>> ComputeAllOverviewsAsync(TileType tileType)
        {
            var (table, column) = GetTableAndColumn(tileType);

            var sql = $@"
                SELECT
                    g.Map,
                    LTRIM(RTRIM(t.{column})) AS TileLocation,
                    gp.EloChange
                FROM {table} t
                JOIN Games_Canonical g ON g.TableId = t.TableId
                JOIN GamePlayers_Canonical gp ON gp.TableId = t.TableId AND gp.PlayerId = t.PlayerId";

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            var rows = await connection.QueryAsync<RawRowWithMap>(sql, commandTimeout: 300);

            return rows
                .Where(r => !string.IsNullOrEmpty(r.Map))
                .Select(r => new { r.Map, Location = NormalizeLocation(r.TileLocation), r.EloChange })
                .Where(r => ShouldInclude(r.Location))
                .GroupBy(r => r.Map)
                .ToDictionary(
                    mg => mg.Key,
                    mg => mg
                        .GroupBy(r => r.Location)
                        .Select(g => new TilePlacementOverview
                        {
                            TileLocation = g.Key,
                            GameCount = g.Count(),
                            AvgEloChange = g.Average(r => r.EloChange ?? 0),
                        })
                        .OrderByDescending(r => r.AvgEloChange)
                        .ToList());
        }

        private async Task<Dictionary<string, List<TilePlacementByGen>>> ComputeAllByGenAsync(TileType tileType)
        {
            var (table, column) = GetTableAndColumn(tileType);

            var sql = $@"
                SELECT
                    g.Map,
                    LTRIM(RTRIM(t.{column})) AS TileLocation,
                    t.PlacedGen,
                    gp.EloChange
                FROM {table} t
                JOIN Games_Canonical g ON g.TableId = t.TableId
                JOIN GamePlayers_Canonical gp ON gp.TableId = t.TableId AND gp.PlayerId = t.PlayerId
                WHERE t.PlacedGen IS NOT NULL";

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            var rows = await connection.QueryAsync<RawRowWithMapAndGen>(sql, commandTimeout: 300);

            return rows
                .Where(r => !string.IsNullOrEmpty(r.Map))
                .Select(r => new { r.Map, Location = NormalizeLocation(r.TileLocation), r.PlacedGen, r.EloChange })
                .Where(r => ShouldInclude(r.Location))
                .GroupBy(r => r.Map)
                .ToDictionary(
                    mg => mg.Key,
                    mg => mg
                        .GroupBy(r => new { r.Location, r.PlacedGen })
                        .Select(g => new TilePlacementByGen
                        {
                            TileLocation = g.Key.Location,
                            PlacedGen = g.Key.PlacedGen,
                            GameCount = g.Count(),
                            AvgEloChange = g.Average(r => r.EloChange ?? 0),
                        })
                        .OrderBy(r => r.TileLocation)
                        .ThenBy(r => r.PlacedGen)
                        .ToList());
        }

        // ── Blob helpers ─────────────────────────────────────

        private async Task<T> TryReadFromBlobAsync<T>(string blobName) where T : class
        {
            try
            {
                var blobConn = Environment.GetEnvironmentVariable("BlobStorageConnectionString");
                if (string.IsNullOrWhiteSpace(blobConn)) return null;

                var service = new BlobServiceClient(blobConn);
                var container = service.GetBlobContainerClient(CacheContainerName);
                var blob = container.GetBlobClient(blobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value) return null;

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                return JsonSerializer.Deserialize<T>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read {blob} from blob cache", blobName);
                return null;
            }
        }

        private async Task TryWriteToBlobAsync<T>(string blobName, T data)
        {
            try
            {
                var blobConn = Environment.GetEnvironmentVariable("BlobStorageConnectionString");
                if (string.IsNullOrWhiteSpace(blobConn)) return;

                var service = new BlobServiceClient(blobConn);
                var container = service.GetBlobContainerClient(CacheContainerName);
                await container.CreateIfNotExistsAsync();
                var blob = container.GetBlobClient(blobName);

                var json = JsonSerializer.Serialize(data);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));
                await blob.UploadAsync(stream, new Azure.Storage.Blobs.Models.BlobUploadOptions
                {
                    HttpHeaders = new Azure.Storage.Blobs.Models.BlobHttpHeaders { ContentType = "application/json" },
                });

                _logger.LogInformation("Wrote {blob} to blob cache", blobName);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write {blob} to blob cache", blobName);
            }
        }

        // ── Helpers & types ──────────────────────────────────

        private static (string table, string column) GetTableAndColumn(TileType tileType) => tileType switch
        {
            TileType.City => ("GameCityLocations", "CityLocation"),
            TileType.Greenery => ("GameGreeneryLocations", "GreeneryLocation"),
            _ => ("GameCityLocations", "CityLocation"),
        };

        private class RawRowWithMap
        {
            public string Map { get; set; }
            public string TileLocation { get; set; }
            public double? EloChange { get; set; }
        }

        private class RawRowWithMapAndGen
        {
            public string Map { get; set; }
            public string TileLocation { get; set; }
            public int? PlacedGen { get; set; }
            public double? EloChange { get; set; }
        }

        public enum TileType
        {
            City,
            Greenery,
        }

        public class TilePlacementOverview
        {
            public string TileLocation { get; set; }
            public int GameCount { get; set; }
            public double AvgEloChange { get; set; }
        }

        public class TilePlacementByGen
        {
            public string TileLocation { get; set; }
            public int? PlacedGen { get; set; }
            public int GameCount { get; set; }
            public double AvgEloChange { get; set; }
        }
    }
}
