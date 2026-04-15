using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
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
        private static readonly HttpClient ParquetApiClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(120)
        };

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

        public class CardFilter
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
            public int? PlayedGenMin { get; set; }
            public int? PlayedGenMax { get; set; }
            public string PlayerName { get; set; }
        }

        public class CardStats
        {
            public int TotalGames { get; set; }
            public double WinRate { get; set; }
            public double AvgElo { get; set; }
            public double AvgEloChange { get; set; }
            public double AvgVpScored { get; set; }
        }

        public class GenerationDatum
        {
            public int Generation { get; set; }
            public int GameCount { get; set; }
            public double WinRate { get; set; }
            public double AvgEloChange { get; set; }
        }

        public class GenerationDistributionDatum
        {
            public int Generation { get; set; }
            public int Count { get; set; }
            public double Percentage { get; set; }
        }

        public class HistogramBin
        {
            public double Min { get; set; }
            public double Max { get; set; }
            public int Count { get; set; }
            public string Label { get; set; }
        }

        public class CardFilterOptions
        {
            public string[] Maps { get; set; }
            public string[] GameModes { get; set; }
            public string[] GameSpeeds { get; set; }
            public int[] PlayerCounts { get; set; }
            public Range EloRange { get; set; }
            public Range PlayedGenRange { get; set; }

            public class Range
            {
                public int Min { get; set; }
                public int Max { get; set; }
            }
        }

        public class CardSummary
        {
            public CardStats Stats { get; set; }
            public List<GenerationDatum> GenerationData { get; set; }
            public List<GenerationDistributionDatum> GenerationDistribution { get; set; }
            public List<HistogramBin> EloHistogram { get; set; }
            public List<HistogramBin> EloChangeHistogram { get; set; }
            public CardFilterOptions FilterOptions { get; set; }
        }

        public class CardGamesPage
        {
            public int Total { get; set; }
            public int Page { get; set; }
            public int PageSize { get; set; }
            public List<ProjectCardPlayerStatsRow> Rows { get; set; }
        }

        public async Task<CardSummary> GetCardSummaryAsync(string cardName, CardFilter filter)
        {
            var baseUrl = (Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "https://api.tfmstats.com").TrimEnd('/');
            var url = $"{baseUrl}/api/cards/{Uri.EscapeDataString(cardName)}/summary{BuildCardQueryString(filter)}";

            var response = await ParquetApiClient.GetAsync(url);
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<CardSummary>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new CardSummary();
        }

        public async Task<CardGamesPage> GetCardGamesAsync(string cardName, CardFilter filter, int page, int pageSize, string sort, string sortDir)
        {
            var baseUrl = (Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "https://api.tfmstats.com").TrimEnd('/');
            var extra = new List<string>();
            if (page > 0) extra.Add($"page={page}");
            if (pageSize > 0) extra.Add($"pageSize={pageSize}");
            if (!string.IsNullOrWhiteSpace(sort)) extra.Add($"sort={Uri.EscapeDataString(sort)}");
            if (!string.IsNullOrWhiteSpace(sortDir)) extra.Add($"sortDir={Uri.EscapeDataString(sortDir)}");

            var filterQs = BuildCardQueryString(filter);
            var url = $"{baseUrl}/api/cards/{Uri.EscapeDataString(cardName)}/games{filterQs}";
            if (extra.Count > 0)
            {
                url += (filterQs.Length == 0 ? "?" : "&") + string.Join("&", extra);
            }

            var response = await ParquetApiClient.GetAsync(url);
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<CardGamesPage>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new CardGamesPage { Rows = new List<ProjectCardPlayerStatsRow>() };
        }

        private static string BuildCardQueryString(CardFilter f)
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
            AddMulti("maps", f.Maps);
            AddMulti("modes", f.Modes);
            AddMulti("speeds", f.Speeds);
            AddMultiInt("playerCounts", f.PlayerCounts);
            if (f.PreludeOn.HasValue) parts.Add($"preludeOn={(f.PreludeOn.Value ? "true" : "false")}");
            if (f.ColoniesOn.HasValue) parts.Add($"coloniesOn={(f.ColoniesOn.Value ? "true" : "false")}");
            if (f.DraftOn.HasValue) parts.Add($"draftOn={(f.DraftOn.Value ? "true" : "false")}");
            if (f.EloMin.HasValue) parts.Add($"eloMin={f.EloMin.Value}");
            if (f.EloMax.HasValue) parts.Add($"eloMax={f.EloMax.Value}");
            if (f.PlayedGenMin.HasValue) parts.Add($"playedGenMin={f.PlayedGenMin.Value}");
            if (f.PlayedGenMax.HasValue) parts.Add($"playedGenMax={f.PlayedGenMax.Value}");
            if (!string.IsNullOrWhiteSpace(f.PlayerName)) parts.Add($"playerName={Uri.EscapeDataString(f.PlayerName)}");

            return parts.Count == 0 ? string.Empty : "?" + string.Join("&", parts);
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
            var baseUrl = (Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "https://api.tfmstats.com").TrimEnd('/');
            var url = $"{baseUrl}/api/cards/{Uri.EscapeDataString(cardName)}/playerstats";

            var response = await ParquetApiClient.GetAsync(url);
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<List<ProjectCardPlayerStatsRow>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new List<ProjectCardPlayerStatsRow>();
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
