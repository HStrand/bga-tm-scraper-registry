using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using BgaTmScraperRegistry.Models;

namespace BgaTmScraperRegistry.Services
{
    public class AwardStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private static readonly HttpClient ParquetApiClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(300)
        };
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

        public class AwardFilter
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
            public string PlayerName { get; set; }
            public string Corporation { get; set; }
            public int? FundedGenMin { get; set; }
            public int? FundedGenMax { get; set; }
            public int? TimesPlayedMin { get; set; } // applies to times funded
            public int? TimesPlayedMax { get; set; }
        }

        public class AwardOverview
        {
            public string Award { get; set; }
            public int TimesFunded { get; set; }
            public double WinRate { get; set; }
            public double AvgEloGain { get; set; }
            public double AvgFundedGen { get; set; }
            public double AvgElo { get; set; }
            public double FlipRate { get; set; }
        }

        public class AwardsFilterOptions
        {
            public Range FundedGenRange { get; set; }
            public string[] Corporations { get; set; }

            public class Range
            {
                public int Min { get; set; }
                public int Max { get; set; }
            }
        }

        private static string BuildAwardsCacheKey(AwardFilter f)
        {
            string Join(string[] arr) => arr == null ? "" : string.Join(",", arr.OrderBy(x => x ?? string.Empty));
            string JoinInt(int[] arr) => arr == null ? "" : string.Join(",", arr.OrderBy(x => x));
            string B(bool? b) => b.HasValue ? (b.Value ? "1" : "0") : "";
            string N(int? n) => n.HasValue ? n.Value.ToString() : "";
            f ??= new AwardFilter();
            var key = $"AwardsOverview:v1" +
                      $"|maps={Join(f.Maps)}" +
                      $"|prelude={B(f.PreludeOn)}" +
                      $"|colonies={B(f.ColoniesOn)}" +
                      $"|draft={B(f.DraftOn)}" +
                      $"|modes={Join(f.Modes)}" +
                      $"|speeds={Join(f.Speeds)}" +
                      $"|pc={JoinInt(f.PlayerCounts)}" +
                      $"|eloMin={N(f.EloMin)}|eloMax={N(f.EloMax)}" +
                      $"|genMin={N(f.GenerationsMin)}|genMax={N(f.GenerationsMax)}" +
                      $"|fundMin={N(f.FundedGenMin)}|fundMax={N(f.FundedGenMax)}" +
                      $"|tpMin={N(f.TimesPlayedMin)}|tpMax={N(f.TimesPlayedMax)}" +
                      $"|player={(f.PlayerName ?? "").Trim().ToLowerInvariant()}" +
                      $"|corp={(f.Corporation ?? "").Trim().ToLowerInvariant()}";
            return key;
        }

        public async Task<List<AwardOverview>> GetAwardsOverviewAsync(AwardFilter filter)
        {
            var cacheKey = BuildAwardsCacheKey(filter);
            if (Cache.TryGetValue(cacheKey, out List<AwardOverview> cached))
            {
                _logger.LogInformation("Returning awards overview from cache for key {key}", cacheKey);
                return cached;
            }

            var baseUrl = (Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "http://20.82.3.63:8001").TrimEnd('/');
            var query = BuildOverviewQueryString(filter);
            var url = $"{baseUrl}/api/awards/overview{query}";

            var response = await ParquetApiClient.GetAsync(url);
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            var list = JsonSerializer.Deserialize<List<AwardOverview>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new List<AwardOverview>();

            foreach (var row in list)
            {
                row.Award = FormatAwardName(row.Award);
            }

            Cache.Set(cacheKey, list, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
            });

            _logger.LogInformation("Computed and cached awards overview with {count} rows for key {key}", list.Count, cacheKey);
            return list;
        }

        private static string BuildOverviewQueryString(AwardFilter f)
        {
            if (f == null) return string.Empty;

            var parts = new List<string>();
            void AddMulti(string key, IEnumerable<string> values)
            {
                if (values == null) return;
                foreach (var v in values)
                {
                    if (!string.IsNullOrWhiteSpace(v))
                        parts.Add($"{key}={Uri.EscapeDataString(v)}");
                }
            }
            void AddMultiInt(string key, IEnumerable<int> values)
            {
                if (values == null) return;
                foreach (var v in values)
                    parts.Add($"{key}={v}");
            }
            void AddScalar(string key, string value)
            {
                if (!string.IsNullOrWhiteSpace(value))
                    parts.Add($"{key}={Uri.EscapeDataString(value)}");
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
            if (f.FundedGenMin.HasValue) parts.Add($"fundedGenMin={f.FundedGenMin.Value}");
            if (f.FundedGenMax.HasValue) parts.Add($"fundedGenMax={f.FundedGenMax.Value}");
            if (f.TimesPlayedMin.HasValue) parts.Add($"timesPlayedMin={f.TimesPlayedMin.Value}");
            if (f.TimesPlayedMax.HasValue) parts.Add($"timesPlayedMax={f.TimesPlayedMax.Value}");
            AddScalar("playerName", f.PlayerName);
            AddScalar("corporation", f.Corporation);

            return parts.Count == 0 ? string.Empty : "?" + string.Join("&", parts);
        }

        public async Task<AwardsFilterOptions> GetAwardsFilterOptionsAsync()
        {
            const string key = "AwardsFilterOptions:v1";
            if (Cache.TryGetValue(key, out AwardsFilterOptions cached))
            {
                return cached;
            }

            var baseUrl = (Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "http://20.82.3.63:8001").TrimEnd('/');
            var response = await ParquetApiClient.GetAsync($"{baseUrl}/api/awards/filter-options");
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            var options = JsonSerializer.Deserialize<AwardsFilterOptions>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new AwardsFilterOptions
            {
                FundedGenRange = new AwardsFilterOptions.Range { Min = 0, Max = 0 },
                Corporations = Array.Empty<string>()
            };

            Cache.Set(key, options, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
            });

            return options;
        }

        private async Task<List<AwardRow>> ComputeAwardRowsFromDbAsync()
        {
            var baseUrl = (Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "http://20.82.3.63:8001").TrimEnd('/');
            var url = $"{baseUrl}/api/awards/rows";

            var response = await ParquetApiClient.GetAsync(url);
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            var result = JsonSerializer.Deserialize<List<AwardRow>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new List<AwardRow>();

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
