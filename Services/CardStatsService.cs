using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
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
    public class CardStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private static readonly HttpClient ParquetApiClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(120)
        };
        private static readonly string[] ExcludedCards =
        {
            "City",
            "Greenery",
            "Aquifer",
            "Sell patents",
            "Undo (no undo beyond this point)",
            "(no undo beyond this point)",
        };
        private const string AllCardStatsCacheKey = "AllCardStats:v2";
        private const string CacheContainerName = "cache";
        private const string CardStatsBlobName = "card-stats.json";
        private const string AllCardOptionStatsCacheKey = "AllCardOptionStats:v1";
        private const string CardOptionStatsBlobName = "card-option-stats.json";

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public CardStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public class CardBasicStatsRow
        {
            public string Card { get; set; }
            public int TimesPlayed { get; set; }
            public double? WinRate { get; set; }
            public double? AvgElo { get; set; }
            public double? AvgEloChange { get; set; }
        }

        public async Task<List<CardBasicStatsRow>> GetAllCardStatsAsync()
        {
            if (Cache.TryGetValue(AllCardStatsCacheKey, out List<CardBasicStatsRow> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} card stats from cache");
                return cached;
            }

            // Try read from blob cross-instance cache
            var blobList = await TryReadFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    AllCardStatsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} card stats from blob cache");
                return blobList;
            }

            var list = await ComputeAllCardStatsFromDbAsync();

            // Cache for 24 hours
            Cache.Set(
                AllCardStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            // Write to blob for cross-instance warm cache
            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} card stats");
            return list;
        }

        public async Task<List<CardBasicStatsRow>> GetAllCardOptionStatsAsync()
        {
            if (Cache.TryGetValue(AllCardOptionStatsCacheKey, out List<CardBasicStatsRow> cached))
            {
                _logger.LogInformation($"Returning {cached.Count} card option stats from cache");
                return cached;
            }

            // Try read from blob cross-instance cache
            var blobList = await TryReadOptionFromBlobAsync();
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(
                    AllCardOptionStatsCacheKey,
                    blobList,
                    new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation($"Loaded {blobList.Count} card option stats from blob cache");
                return blobList;
            }

            var list = await ComputeAllCardOptionStatsFromDbAsync();

            Cache.Set(
                AllCardOptionStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteOptionToBlobAsync(list);

            _logger.LogInformation($"Retrieved and cached {list.Count} card option stats");
            return list;
        }

        public async Task RefreshAllCardStatsCacheAsync()
        {
            var list = await ComputeAllCardStatsFromDbAsync();

            Cache.Set(
                AllCardStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteToBlobAsync(list);

            _logger.LogInformation($"Refreshed card stats cache with {list.Count} rows");
        }

        public async Task RefreshAllCardOptionStatsCacheAsync()
        {
            var list = await ComputeAllCardOptionStatsFromDbAsync();

            Cache.Set(
                AllCardOptionStatsCacheKey,
                list,
                new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });

            await TryWriteOptionToBlobAsync(list);

            _logger.LogInformation($"Refreshed card option stats cache with {list.Count} rows");
        }

        private async Task<List<CardBasicStatsRow>> ComputeAllCardStatsFromDbAsync()
        {
            return await FetchFromParquetApiAsync("/api/cards/stats");
        }

        private async Task<List<CardBasicStatsRow>> TryReadFromBlobAsync()
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
                var blob = container.GetBlobClient(CardStatsBlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<CardBasicStatsRow>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read card stats from blob cache");
                return null;
            }
        }

        private async Task TryWriteToBlobAsync(List<CardBasicStatsRow> list)
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
                var blob = container.GetBlobClient(CardStatsBlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write card stats to blob cache");
            }
        }

        private async Task<List<CardBasicStatsRow>> ComputeAllCardOptionStatsFromDbAsync()
        {
            return await FetchFromParquetApiAsync("/api/cards/option-stats");
        }

        private async Task<List<CardBasicStatsRow>> FetchFromParquetApiAsync(string path)
        {
            var baseUrl = (Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "http://20.82.3.63:8001").TrimEnd('/');
            var url = $"{baseUrl}{path}";

            var response = await ParquetApiClient.GetAsync(url);
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            var rows = JsonSerializer.Deserialize<List<CardBasicStatsRow>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new List<CardBasicStatsRow>();

            return rows
                .Where(c => !string.IsNullOrEmpty(c.Card)
                    && !ExcludedCards.Contains(c.Card)
                    && !c.Card.Contains("a card ")
                    && !c.Card.StartsWith("card ")
                    && !c.Card.StartsWith("card_main_")
                    && !c.Card.StartsWith("card_prelude_")
                    && !c.Card.StartsWith("10 cards:")
                    && !c.Card.StartsWith("10 cards:")
					&& !c.Card.StartsWith("Gaillean"))
                .ToList();
        }

        private async Task<List<CardBasicStatsRow>> TryReadOptionFromBlobAsync()
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
                var blob = container.GetBlobClient(CardOptionStatsBlobName);

                var exists = await blob.ExistsAsync();
                if (!exists.Value)
                {
                    return null;
                }

                var download = await blob.DownloadContentAsync();
                var json = download.Value.Content.ToString();
                var list = JsonSerializer.Deserialize<List<CardBasicStatsRow>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read card option stats from blob cache");
                return null;
            }
        }

        private async Task TryWriteOptionToBlobAsync(List<CardBasicStatsRow> list)
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
                var blob = container.GetBlobClient(CardOptionStatsBlobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write card option stats to blob cache");
            }
        }

        private static readonly HashSet<string> PreludeNames = new(StringComparer.OrdinalIgnoreCase)
        {
            "Acquired Space Agency",
            "Allied Bank",
            "Allied Banks",
            "Aquifer Turbines",
            "Biofuels",
            "Biolabs",
            "Biosphere Support",
            "Business Empire",
            "Dome Farming",
            "Donation",
            "Early Settlement",
            "Eccentric Sponsor",
            "Ecology Experts",
            "Excentric Sponsor",
            "Experimental Forest",
            "Galilean Mining",
            "Great Aquifer",
            "Huge Asteroid",
            "Io Research Outpost",
            "Loan",
            "Martian Industries",
            "Metal-Rich Asteroid",
            "Metals Company",
            "Mining Operations",
            "Mohole",
            "Mohole Excavation",
            "Nitrogen Shipment",
            "Orbital Construction Yard",
            "Polar Industries",
            "Power Generation",
            "Research Network",
            "Self-Sufficient Settlement",
            "Smelting Plant",
            "Society Support",
            "Supplier",
            "Supply Drop",
            "UNMI Contractor",
        };

        public Task<HashSet<string>> GetPreludeNamesAsync()
        {
            return Task.FromResult(PreludeNames);
        }

        private static readonly HashSet<string> CorporationNames = new(StringComparer.OrdinalIgnoreCase)
        {
            "Aridor",
            "Arklight",
            "Cheung Shing Mars",
            "CrediCor",
            "Ecoline",
            "Helion",
            "Interplanetary Cinematics",
            "Inventrix",
            "Mining Guild",
            "PhoboLog",
            "Point Luna",
            "Polyphemos",
            "Poseidon",
            "Robinson Industries",
            "Saturn Systems",
            "Stormcraft",
            "Teractor",
            "Tharsis Republic",
            "ThorGate",
            "United Nations Mars Initiative",
            "Valley Trust",
            "Vitor",
        };

        public Task<HashSet<string>> GetCorporationNamesAsync()
        {
            return Task.FromResult(CorporationNames);
        }

        public async Task<List<CardBasicStatsRow>> GetProjectCardStatsAsync()
        {
            var allStats = await GetAllCardStatsAsync();
            var preludeNames = await GetPreludeNamesAsync();
            var corporationNames = await GetCorporationNamesAsync();

            var projectCardStats = allStats
                .Where(card => !preludeNames.Contains(card.Card) && !corporationNames.Contains(card.Card))
                .OrderByDescending(card => card.AvgEloChange)
                .ToList();

            _logger.LogInformation($"Filtered to {projectCardStats.Count} project card stats (excluding {preludeNames.Count} preludes)");
            return projectCardStats;
        }

        public async Task<List<CardBasicStatsRow>> GetProjectCardOptionStatsAsync()
        {
            var allStats = await GetAllCardOptionStatsAsync();
            var preludeNames = await GetPreludeNamesAsync();
            var corporationNames = await GetCorporationNamesAsync();

            var projectCardStats = allStats
                .Where(card => !preludeNames.Contains(card.Card) && !corporationNames.Contains(card.Card))
                .OrderByDescending(card => card.AvgEloChange)
                .ToList();

            _logger.LogInformation($"Filtered to {projectCardStats.Count} project card option stats (excluding {preludeNames.Count} preludes)");
            return projectCardStats;
        }

        public async Task<List<CardBasicStatsRow>> GetPreludeStatsAsync()
        {
            var allStats = await GetAllCardStatsAsync();
            var preludeNames = await GetPreludeNamesAsync();

            var preludeStats = allStats
                .Where(card => preludeNames.Contains(card.Card))
                .OrderByDescending(card => card.AvgEloChange)
                .ToList();

            _logger.LogInformation($"Filtered to {preludeStats.Count} prelude stats");

            // Normalize specific prelude name(s) after fetching (data cleanup)
            foreach (var c in preludeStats)
            {
                if (!string.IsNullOrWhiteSpace(c.Card) && c.Card.Equals("Allied Bank", StringComparison.OrdinalIgnoreCase))
                {
                    c.Card = "Allied Banks";
                }
            }

            return preludeStats;
        }
    }
}
