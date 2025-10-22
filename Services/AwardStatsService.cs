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

            var rows = await GetAllAwardRowsAsync();
            IEnumerable<AwardRow> q = rows;

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
                if (!string.IsNullOrWhiteSpace(filter.Corporation))
                    q = q.Where(r => !string.IsNullOrEmpty(r.Corporation) && r.Corporation.Equals(filter.Corporation, StringComparison.OrdinalIgnoreCase));
                if (filter.FundedGenMin.HasValue)
                    q = q.Where(r => r.FundedGen >= filter.FundedGenMin.Value);
                if (filter.FundedGenMax.HasValue)
                    q = q.Where(r => r.FundedGen <= filter.FundedGenMax.Value);
            }

            // Group by award; only consider rows where the player actually funded the award
            var grouped = q.GroupBy(r => r.Award);

            var list = new List<AwardOverview>();
            foreach (var g in grouped)
            {
                var fundedRows = g.Where(r =>
                    r.PlayerId == r.FundedBy ||
                    (r.PlayerCounter.HasValue && r.PlayerCounter.Value == r.FundedBy)).ToList();

                var n = fundedRows.Count;
                if (n == 0) continue;

                var wins = fundedRows.Count(r => r.Position == 1);
                var awardFirsts = fundedRows.Count(r => r.PlayerPlace == 1);

                var avgEloGain = fundedRows.Select(r => (double)(r.EloChange ?? 0)).DefaultIfEmpty(0).Average();
                var avgElo = fundedRows.Select(r => (double)(r.Elo ?? 0)).DefaultIfEmpty(0).Average();
                var avgFundedGen = fundedRows.Select(r => (double)r.FundedGen).DefaultIfEmpty(0).Average();

                var overview = new AwardOverview
                {
                    Award = g.Key,
                    TimesFunded = n,
                    WinRate = n == 0 ? 0 : (double)wins / n,
                    AvgEloGain = avgEloGain,
                    AvgFundedGen = avgFundedGen,
                    AvgElo = avgElo,
                    FlipRate = n == 0 ? 0 : 1.0 - ((double)awardFirsts / n),
                };

                list.Add(overview);
            }

            // Apply times funded filter after aggregation
            if (filter?.TimesPlayedMin.HasValue == true)
                list = list.Where(r => r.TimesFunded >= filter.TimesPlayedMin.Value).ToList();
            if (filter?.TimesPlayedMax.HasValue == true)
                list = list.Where(r => r.TimesFunded <= filter.TimesPlayedMax.Value).ToList();

            Cache.Set(cacheKey, list, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
            });

            _logger.LogInformation("Computed and cached awards overview with {count} rows for key {key}", list.Count, cacheKey);
            return list;
        }

        public async Task<AwardsFilterOptions> GetAwardsFilterOptionsAsync()
        {
            const string key = "AwardsFilterOptions:v1";
            if (Cache.TryGetValue(key, out AwardsFilterOptions cached))
            {
                return cached;
            }

            var rows = await GetAllAwardRowsAsync();
            var gens = rows.Select(r => r.FundedGen).ToList();

            var min = gens.Count > 0 ? gens.Min() : 0;
            var max = gens.Count > 0 ? gens.Max() : 0;

            var corporations = rows.Select(r => r.Corporation)
                                   .Where(s => !string.IsNullOrWhiteSpace(s) && !string.Equals(s, "Unknown", StringComparison.OrdinalIgnoreCase))
                                   .Distinct(StringComparer.OrdinalIgnoreCase)
                                   .OrderBy(s => s, StringComparer.OrdinalIgnoreCase)
                                   .ToArray();

            var options = new AwardsFilterOptions
            {
                FundedGenRange = new AwardsFilterOptions.Range { Min = min, Max = max },
                Corporations = corporations
            };

            Cache.Set(key, options, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
            });

            return options;
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
