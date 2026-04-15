using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Dapper;

namespace BgaTmScraperRegistry.Services
{
    /// <summary>
    /// Server-side, filterable prelude rankings based on StartingHandPreludes (Kept = 1),
    /// joined to Games/GameStats/GamePlayers/GamePlayerStats to support the same filters
    /// used on the Corporations overview page, plus an additional Corporation filter.
    /// </summary>
    public class PreludeStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private static readonly HttpClient ParquetApiClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(120)
        };

        private const string AllPreludePlayerRowsCacheKey = "AllPreludePlayerRows:v2";
        private const string OptionsCacheKey = "PreludeFilterOptions:v1";
        private const string CacheContainerName = "cache";
        private const string BlobName = "prelude-player-stats.json";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public PreludeStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public class PreludePlayerRow
        {
            public int TableId { get; set; }
            public int PlayerId { get; set; }
            public string Prelude { get; set; }

            public string Map { get; set; }
            public bool? PreludeOn { get; set; }
            public bool? ColoniesOn { get; set; }
            public bool? DraftOn { get; set; }
            public string GameMode { get; set; }
            public string GameSpeed { get; set; }

            public int? PlayerCount { get; set; }
            public int? Generations { get; set; }

            public string Corporation { get; set; }
            public string PlayerName { get; set; }
            public int? Elo { get; set; }
            public int? EloChange { get; set; }
            public int? Position { get; set; }
        }

        public class PreludeFilter
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
            public string Corporation { get; set; }
        }

        public class PreludeRanking
        {
            public string Prelude { get; set; }   // display name as stored in StartingHandPreludes.Prelude
            public double WinRate { get; set; }   // percent 0..100 for parity with corporation endpoint
            public double AvgEloGain { get; set; }
            public int GamesPlayed { get; set; }
            public double AvgElo { get; set; }
        }

        public class PreludeFilterOptions
        {
            public string[] Maps { get; set; }
            public string[] GameModes { get; set; }
            public string[] GameSpeeds { get; set; }
            public int[] PlayerCounts { get; set; }
            public Range EloRange { get; set; }
            public Range GenerationsRange { get; set; }
            public string[] Corporations { get; set; }

            public class Range
            {
                public int Min { get; set; }
                public int Max { get; set; }
            }
        }

        private static string BuildRankingsCacheKey(PreludeFilter f)
        {
            string Join(string[] arr) => arr == null ? "" : string.Join(",", arr.OrderBy(x => x ?? string.Empty));
            string JoinInt(int[] arr) => arr == null ? "" : string.Join(",", arr.OrderBy(x => x));
            string B(bool? b) => b.HasValue ? (b.Value ? "1" : "0") : "";
            string N(int? n) => n.HasValue ? n.Value.ToString() : "";
            f ??= new PreludeFilter();
            var key = $"PreludeRankings:v1|maps={Join(f.Maps)}|prelude={B(f.PreludeOn)}|colonies={B(f.ColoniesOn)}|draft={B(f.DraftOn)}|modes={Join(f.Modes)}|speeds={Join(f.Speeds)}|pc={JoinInt(f.PlayerCounts)}|eloMin={N(f.EloMin)}|eloMax={N(f.EloMax)}|genMin={N(f.GenerationsMin)}|genMax={N(f.GenerationsMax)}|tpMin={N(f.TimesPlayedMin)}|tpMax={N(f.TimesPlayedMax)}|player={f.PlayerName?.Trim().ToLowerInvariant() ?? ""}|corp={f.Corporation?.Trim().ToLowerInvariant() ?? ""}";
            return key;
        }

        /// <summary>
        /// Returns the deduplicated, joined per-player rows for each kept prelude.
        /// </summary>
        public async Task<List<PreludePlayerRow>> GetAllPreludePlayerRowsAsync()
        {
            if (Cache.TryGetValue(AllPreludePlayerRowsCacheKey, out List<PreludePlayerRow> cached))
            {
                _logger.LogInformation("Returning prelude player rows from memory cache with {count} rows", cached.Count);
                return cached;
            }

            // Try cross-instance blob cache
            var blobList = await TryReadFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                NormalizePreludeNames(blobList);
                Cache.Set(
                    AllPreludePlayerRowsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation("Loaded {count} prelude player rows from blob cache", blobList.Count);
                return blobList;
            }

            var list = await ComputeFromDbAsync();

            NormalizePreludeNames(list);

            Cache.Set(
                AllPreludePlayerRowsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteToBlobAsync(list);

            _logger.LogInformation("Retrieved and cached {count} prelude player rows", list.Count);
            return list;
        }

        public async Task RefreshAllPreludeStatsCacheAsync()
        {
            var list = await ComputeFromDbAsync();

            NormalizePreludeNames(list);

            Cache.Set(
                AllPreludePlayerRowsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteToBlobAsync(list);

            _logger.LogInformation("Refreshed prelude stats cache with {count} rows", list.Count);
        }

        private async Task<List<PreludePlayerRow>> ComputeFromDbAsync()
        {
            var sql = @"
SELECT
    shp.TableId,
    shp.PlayerId,
    shp.Prelude,
    g.Map,
    g.PreludeOn,
    g.ColoniesOn,
    g.DraftOn,
    g.GameMode,
    g.GameSpeed,
    gs.PlayerCount,
    gs.Generations,
    gps.Corporation,
    gp.PlayerName,
    gp.Elo,
    gp.EloChange,
    gp.Position
FROM StartingHandPreludes shp WITH (NOLOCK)
JOIN Games_Canonical g WITH (NOLOCK)
  ON g.TableId = shp.TableId
JOIN GameStats gs WITH (NOLOCK)
  ON gs.TableId = shp.TableId
JOIN GamePlayers_Canonical gp WITH (NOLOCK)
  ON gp.TableId = shp.TableId AND gp.PlayerId = shp.PlayerId
JOIN GamePlayerStats gps WITH (NOLOCK)
  ON gps.TableId = shp.TableId AND gps.PlayerId = shp.PlayerId
WHERE shp.Kept = 1
ORDER BY shp.TableId DESC;";

            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            var rows = await conn.QueryAsync<PreludePlayerRow>(sql, commandTimeout: 600);
            return rows.ToList();
        }

        private static void NormalizePreludeNames(List<PreludePlayerRow> list)
        {
            if (list == null) return;
            foreach (var r in list)
            {
                if (!string.IsNullOrWhiteSpace(r.Prelude) && r.Prelude.Equals("Allied Bank", StringComparison.OrdinalIgnoreCase))
                {
                    r.Prelude = "Allied Banks";
                }
                if (!string.IsNullOrWhiteSpace(r.Prelude) && r.Prelude.Equals("Excentric Sponsor", StringComparison.OrdinalIgnoreCase))
                {
                    r.Prelude = "Eccentric Sponsor";
                }
            }
        }

        public async Task<PreludeFilterOptions> GetPreludeFilterOptionsAsync()
        {
            if (Cache.TryGetValue(OptionsCacheKey, out PreludeFilterOptions cached))
            {
                _logger.LogInformation("Returning prelude filter options from memory cache");
                return cached;
            }

            var baseUrl = (Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "https://api.tfmstats.com").TrimEnd('/');
            var response = await ParquetApiClient.GetAsync($"{baseUrl}/api/preludes/filter-options");
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            var options = JsonSerializer.Deserialize<PreludeFilterOptions>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new PreludeFilterOptions
            {
                Maps = Array.Empty<string>(),
                GameModes = Array.Empty<string>(),
                GameSpeeds = Array.Empty<string>(),
                PlayerCounts = Array.Empty<int>(),
                EloRange = new PreludeFilterOptions.Range(),
                GenerationsRange = new PreludeFilterOptions.Range(),
                Corporations = Array.Empty<string>()
            };

            Cache.Set(OptionsCacheKey, options, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
            });

            _logger.LogInformation("Fetched and cached prelude filter options from parquet API");
            return options;
        }

        public async Task<List<PreludeRanking>> GetPreludeRankingsAsync(PreludeFilter filter)
        {
            var cacheKey = BuildRankingsCacheKey(filter);
            if (Cache.TryGetValue(cacheKey, out List<PreludeRanking> cached))
            {
                _logger.LogInformation("Returning {count} prelude rankings from memory cache for key {key}", cached.Count, cacheKey);
                return cached;
            }

            var baseUrl = (Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "https://api.tfmstats.com").TrimEnd('/');
            var url = $"{baseUrl}/api/preludes/rankings{BuildRankingsQueryString(filter)}";

            var response = await ParquetApiClient.GetAsync(url);
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            var list = JsonSerializer.Deserialize<List<PreludeRanking>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new List<PreludeRanking>();

            Cache.Set(cacheKey, list, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
            });

            _logger.LogInformation("Fetched and cached {count} prelude rankings for key {key}", list.Count, cacheKey);
            return list;
        }

        private static string BuildRankingsQueryString(PreludeFilter f)
        {
            if (f == null) return string.Empty;
            var parts = new List<string>();
            void AddMulti(string key, IEnumerable<string> values)
            {
                if (values == null) return;
                foreach (var v in values)
                    if (!string.IsNullOrWhiteSpace(v)) parts.Add($"{key}={Uri.EscapeDataString(v)}");
            }
            void AddMultiInt(string key, IEnumerable<int> values)
            {
                if (values == null) return;
                foreach (var v in values) parts.Add($"{key}={v}");
            }
            void AddScalar(string key, string value)
            {
                if (!string.IsNullOrWhiteSpace(value)) parts.Add($"{key}={Uri.EscapeDataString(value)}");
            }

            AddMulti("maps", f.Maps);
            AddMulti("modes", f.Modes);
            AddMulti("speeds", f.Speeds);
            AddMultiInt("playerCounts", f.PlayerCounts);
            if (f.PreludeOn.HasValue) parts.Add($"preludeOn={(f.PreludeOn.Value ? "true" : "false")}");
            if (f.ColoniesOn.HasValue) parts.Add($"coloniesOn={(f.ColoniesOn.Value ? "true" : "false")}");
            if (f.DraftOn.HasValue) parts.Add($"draftOn={(f.DraftOn.Value ? "true" : "false")}");
            if (f.EloMin.HasValue) parts.Add($"eloMin={f.EloMin.Value}");
            if (f.EloMax.HasValue) parts.Add($"eloMax={f.EloMax.Value}");
            if (f.GenerationsMin.HasValue) parts.Add($"generationsMin={f.GenerationsMin.Value}");
            if (f.GenerationsMax.HasValue) parts.Add($"generationsMax={f.GenerationsMax.Value}");
            if (f.TimesPlayedMin.HasValue) parts.Add($"timesPlayedMin={f.TimesPlayedMin.Value}");
            if (f.TimesPlayedMax.HasValue) parts.Add($"timesPlayedMax={f.TimesPlayedMax.Value}");
            AddScalar("playerName", f.PlayerName);
            AddScalar("corporation", f.Corporation);

            return parts.Count == 0 ? string.Empty : "?" + string.Join("&", parts);
        }

        // ── Blob helpers ─────────────────────────────────────

        private async Task<List<PreludePlayerRow>> TryReadFromBlobAsync()
        {
            try
            {
                var blobConn = Environment.GetEnvironmentVariable("BlobStorageConnectionString");
                if (string.IsNullOrWhiteSpace(blobConn)) return null;

                var service = new BlobServiceClient(blobConn);
                var container = service.GetBlobContainerClient(CacheContainerName);
                var blob = container.GetBlobClient(BlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value) return null;

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                return JsonSerializer.Deserialize<List<PreludePlayerRow>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read prelude stats from blob cache");
                return null;
            }
        }

        private async Task TryWriteToBlobAsync(List<PreludePlayerRow> list)
        {
            try
            {
                var blobConn = Environment.GetEnvironmentVariable("BlobStorageConnectionString");
                if (string.IsNullOrWhiteSpace(blobConn)) return;

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
                _logger.LogWarning(ex, "Failed to write prelude stats to blob cache");
            }
        }
    }
}
