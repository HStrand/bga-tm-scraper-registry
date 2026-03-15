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
    public class CombinationStatsService
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string CacheContainerName = "cache";

        private static readonly (string CacheKey, string BlobName)[] BaselineConfigs =
        {
            ("ComboCardBaselines:v1", "combo-card-baselines.json"),
            ("ComboCorpBaselines:v1", "combo-corp-baselines.json"),
            ("ComboPreludeBaselines:v1", "combo-prelude-baselines.json"),
        };

        private static readonly Dictionary<string, (string CacheKey, string BlobName)> ComboConfigs = new()
        {
            ["corp-prelude"] = ("CombosCorpPrelude:v1", "combos-corp-prelude.json"),
            ["corp-card"] = ("CombosCorpCard:v1", "combos-corp-card.json"),
            ["prelude-prelude"] = ("CombosPreludePrelude:v1", "combos-prelude-prelude.json"),
            ["prelude-card"] = ("CombosPreludeCard:v1", "combos-prelude-card.json"),
            ["card-card"] = ("CombosCardCard:v1", "combos-card-card.json"),
        };

        private readonly string _connectionString;
        private readonly ILogger _logger;

        public CombinationStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        // --- Public Get methods ---

        public async Task<List<CombinationBaselineRow>> GetCardBaselinesAsync()
            => await GetCachedAsync<CombinationBaselineRow>(BaselineConfigs[0].CacheKey, BaselineConfigs[0].BlobName, ComputeCardBaselinesFromDbAsync);

        public async Task<List<CombinationBaselineRow>> GetCorpBaselinesAsync()
            => await GetCachedAsync<CombinationBaselineRow>(BaselineConfigs[1].CacheKey, BaselineConfigs[1].BlobName, ComputeCorpBaselinesFromDbAsync);

        public async Task<List<CombinationBaselineRow>> GetPreludeBaselinesAsync()
            => await GetCachedAsync<CombinationBaselineRow>(BaselineConfigs[2].CacheKey, BaselineConfigs[2].BlobName, ComputePreludeBaselinesFromDbAsync);

        public async Task<List<CombinationComboRow>> GetCombosAsync(string type)
        {
            if (!ComboConfigs.TryGetValue(type, out var config))
                throw new ArgumentException($"Unknown combo type: {type}");

            return await GetCachedAsync<CombinationComboRow>(config.CacheKey, config.BlobName, () => ComputeCombosFromDbAsync(type));
        }

        // --- Public Refresh methods ---

        public async Task RefreshAllExceptCardCardAsync()
        {
            await RefreshAsync<CombinationBaselineRow>(BaselineConfigs[0].CacheKey, BaselineConfigs[0].BlobName, ComputeCardBaselinesFromDbAsync, "card baselines");
            await RefreshAsync<CombinationBaselineRow>(BaselineConfigs[1].CacheKey, BaselineConfigs[1].BlobName, ComputeCorpBaselinesFromDbAsync, "corp baselines");
            await RefreshAsync<CombinationBaselineRow>(BaselineConfigs[2].CacheKey, BaselineConfigs[2].BlobName, ComputePreludeBaselinesFromDbAsync, "prelude baselines");

            foreach (var kvp in ComboConfigs)
            {
                if (kvp.Key == "card-card") continue;
                await RefreshAsync<CombinationComboRow>(kvp.Value.CacheKey, kvp.Value.BlobName, () => ComputeCombosFromDbAsync(kvp.Key), kvp.Key);
            }
        }

        public async Task RefreshCardCardCacheAsync()
        {
            var config = ComboConfigs["card-card"];
            await RefreshAsync<CombinationComboRow>(config.CacheKey, config.BlobName, () => ComputeCombosFromDbAsync("card-card"), "card-card");
        }

        // --- Generic cache helpers ---

        private async Task<List<T>> GetCachedAsync<T>(string cacheKey, string blobName, Func<Task<List<T>>> computeFromDb)
        {
            if (Cache.TryGetValue(cacheKey, out List<T> cached))
            {
                _logger.LogInformation("Returning {count} rows from cache for {key}", cached.Count, cacheKey);
                return cached;
            }

            var blobList = await TryReadFromBlobAsync<T>(blobName);
            if (blobList != null && blobList.Count > 0)
            {
                Cache.Set(cacheKey, blobList, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
                _logger.LogInformation("Loaded {count} rows from blob cache for {key}", blobList.Count, cacheKey);
                return blobList;
            }

            var list = await computeFromDb();
            Cache.Set(cacheKey, list, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
            await TryWriteToBlobAsync(blobName, list);
            _logger.LogInformation("Retrieved and cached {count} rows for {key}", list.Count, cacheKey);
            return list;
        }

        private async Task RefreshAsync<T>(string cacheKey, string blobName, Func<Task<List<T>>> computeFromDb, string label)
        {
            var list = await computeFromDb();
            Cache.Set(cacheKey, list, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) });
            await TryWriteToBlobAsync(blobName, list);
            _logger.LogInformation("Refreshed {label} cache with {count} rows", label, list.Count);
        }

        // --- DB compute methods ---

        private const string EligiblePlayersCte = @"
;WITH EligiblePlayers AS
(
    SELECT
        gpc.TableId,
        gpc.PlayerId,
        gpc.EloChange,
        gpc.Position
    FROM dbo.GamePlayers_Canonical gpc
    INNER JOIN dbo.Games_Canonical gc
        ON gc.TableId = gpc.TableId
    INNER JOIN dbo.GameStats gs
        ON gs.TableId = gpc.TableId
    WHERE
        gs.PlayerCount = 2
        AND gc.GameMode <> 'Friendly mode'
        AND gc.ColoniesOn = 0
        AND gc.PreludeOn = 1
        AND gc.DraftOn = 1
)";

        private async Task<List<CombinationBaselineRow>> ComputeCardBaselinesFromDbAsync()
        {
            var sql = EligiblePlayersCte + @"
SELECT
    shc.Card AS Name,
    COUNT(*) AS GameCount,
    AVG(CONVERT(float, ep.EloChange)) AS AvgEloChange,
    AVG(CASE WHEN ep.Position = 1 THEN 1.0 ELSE 0.0 END) AS WinRate
FROM EligiblePlayers ep
INNER JOIN dbo.StartingHandCards shc
    ON shc.TableId = ep.TableId AND shc.PlayerId = ep.PlayerId AND shc.Kept = 1
GROUP BY shc.Card
ORDER BY AvgEloChange DESC, GameCount DESC;";

            return await QueryAsync<CombinationBaselineRow>(sql, 300);
        }

        private async Task<List<CombinationBaselineRow>> ComputeCorpBaselinesFromDbAsync()
        {
            var sql = EligiblePlayersCte + @"
SELECT
    shc.Corporation AS Name,
    COUNT(*) AS GameCount,
    AVG(CONVERT(float, ep.EloChange)) AS AvgEloChange,
    AVG(CASE WHEN ep.Position = 1 THEN 1.0 ELSE 0.0 END) AS WinRate
FROM EligiblePlayers ep
INNER JOIN dbo.StartingHandCorporations shc
    ON shc.TableId = ep.TableId AND shc.PlayerId = ep.PlayerId AND shc.Kept = 1
GROUP BY shc.Corporation
ORDER BY AvgEloChange DESC, GameCount DESC;";

            return await QueryAsync<CombinationBaselineRow>(sql, 300);
        }

        private async Task<List<CombinationBaselineRow>> ComputePreludeBaselinesFromDbAsync()
        {
            var sql = EligiblePlayersCte + @"
SELECT
    shp.Prelude AS Name,
    COUNT(*) AS GameCount,
    AVG(CONVERT(float, ep.EloChange)) AS AvgEloChange,
    AVG(CASE WHEN ep.Position = 1 THEN 1.0 ELSE 0.0 END) AS WinRate
FROM EligiblePlayers ep
INNER JOIN dbo.StartingHandPreludes shp
    ON shp.TableId = ep.TableId AND shp.PlayerId = ep.PlayerId AND shp.Kept = 1
GROUP BY shp.Prelude
ORDER BY AvgEloChange DESC, GameCount DESC;";

            return await QueryAsync<CombinationBaselineRow>(sql, 300);
        }

        private async Task<List<CombinationComboRow>> ComputeCombosFromDbAsync(string type)
        {
            var sql = type switch
            {
                "corp-prelude" => EligiblePlayersCte + @"
SELECT
    shc.Corporation AS Name1,
    shp.Prelude AS Name2,
    COUNT(*) AS GameCount,
    AVG(CONVERT(float, ep.EloChange)) AS AvgEloChange,
    AVG(CASE WHEN ep.Position = 1 THEN 1.0 ELSE 0.0 END) AS WinRate
FROM EligiblePlayers ep
INNER JOIN dbo.StartingHandCorporations shc
    ON shc.TableId = ep.TableId AND shc.PlayerId = ep.PlayerId AND shc.Kept = 1
INNER JOIN dbo.StartingHandPreludes shp
    ON shp.TableId = ep.TableId AND shp.PlayerId = ep.PlayerId AND shp.Kept = 1
GROUP BY shc.Corporation, shp.Prelude
HAVING COUNT(*) >= 100
ORDER BY AvgEloChange DESC, GameCount DESC;",

                "corp-card" => EligiblePlayersCte + @"
SELECT
    shcorp.Corporation AS Name1,
    shc.Card AS Name2,
    COUNT(*) AS GameCount,
    AVG(CONVERT(float, ep.EloChange)) AS AvgEloChange,
    AVG(CASE WHEN ep.Position = 1 THEN 1.0 ELSE 0.0 END) AS WinRate
FROM EligiblePlayers ep
INNER JOIN dbo.StartingHandCorporations shcorp
    ON shcorp.TableId = ep.TableId AND shcorp.PlayerId = ep.PlayerId AND shcorp.Kept = 1
INNER JOIN dbo.StartingHandCards shc
    ON shc.TableId = ep.TableId AND shc.PlayerId = ep.PlayerId AND shc.Kept = 1
GROUP BY shcorp.Corporation, shc.Card
HAVING COUNT(*) >= 100
ORDER BY AvgEloChange DESC, GameCount DESC;",

                "prelude-prelude" => EligiblePlayersCte + @",
EligiblePreludes AS
(
    SELECT
        ep.TableId,
        ep.PlayerId,
        shp.Prelude,
        ep.EloChange,
        ep.Position
    FROM EligiblePlayers ep
    INNER JOIN dbo.StartingHandPreludes shp
        ON shp.TableId = ep.TableId AND shp.PlayerId = ep.PlayerId AND shp.Kept = 1
)
SELECT
    p1.Prelude AS Name1,
    p2.Prelude AS Name2,
    COUNT(*) AS GameCount,
    AVG(CONVERT(float, p1.EloChange)) AS AvgEloChange,
    AVG(CASE WHEN p1.Position = 1 THEN 1.0 ELSE 0.0 END) AS WinRate
FROM EligiblePreludes p1
INNER JOIN EligiblePreludes p2
    ON p2.TableId = p1.TableId AND p2.PlayerId = p1.PlayerId AND p1.Prelude < p2.Prelude
GROUP BY p1.Prelude, p2.Prelude
HAVING COUNT(*) >= 100
ORDER BY AvgEloChange DESC, GameCount DESC;",

                "prelude-card" => EligiblePlayersCte + @"
SELECT
    shp.Prelude AS Name1,
    shc.Card AS Name2,
    COUNT(*) AS GameCount,
    AVG(CONVERT(float, ep.EloChange)) AS AvgEloChange,
    AVG(CASE WHEN ep.Position = 1 THEN 1.0 ELSE 0.0 END) AS WinRate
FROM EligiblePlayers ep
INNER JOIN dbo.StartingHandPreludes shp
    ON shp.TableId = ep.TableId AND shp.PlayerId = ep.PlayerId AND shp.Kept = 1
INNER JOIN dbo.StartingHandCards shc
    ON shc.TableId = ep.TableId AND shc.PlayerId = ep.PlayerId AND shc.Kept = 1
GROUP BY shp.Prelude, shc.Card
HAVING COUNT(*) >= 100
ORDER BY AvgEloChange DESC, GameCount DESC;",

                "card-card" => EligiblePlayersCte + @",
EligibleCards AS
(
    SELECT
        ep.TableId,
        ep.PlayerId,
        shc.Card,
        ep.EloChange,
        ep.Position
    FROM EligiblePlayers ep
    INNER JOIN dbo.StartingHandCards shc
        ON shc.TableId = ep.TableId AND shc.PlayerId = ep.PlayerId AND shc.Kept = 1
)
SELECT
    c1.Card AS Name1,
    c2.Card AS Name2,
    COUNT(*) AS GameCount,
    AVG(CONVERT(float, c1.EloChange)) AS AvgEloChange,
    AVG(CASE WHEN c1.Position = 1 THEN 1.0 ELSE 0.0 END) AS WinRate
FROM EligibleCards c1
INNER JOIN EligibleCards c2
    ON c2.TableId = c1.TableId AND c2.PlayerId = c1.PlayerId AND c1.Card < c2.Card
GROUP BY c1.Card, c2.Card
HAVING COUNT(*) >= 100
ORDER BY AvgEloChange DESC, GameCount DESC;",

                _ => throw new ArgumentException($"Unknown combo type: {type}")
            };

            var timeout = type == "card-card" ? 540 : 300;
            return await QueryAsync<CombinationComboRow>(sql, timeout);
        }

        private async Task<List<T>> QueryAsync<T>(string sql, int commandTimeout)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            var rows = await conn.QueryAsync<T>(sql, commandTimeout: commandTimeout);
            return rows.ToList();
        }

        // --- Blob helpers ---

        private async Task<List<T>> TryReadFromBlobAsync<T>(string blobName)
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
                var list = JsonSerializer.Deserialize<List<T>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read {blobName} from blob cache", blobName);
                return null;
            }
        }

        private async Task TryWriteToBlobAsync<T>(string blobName, List<T> list)
        {
            try
            {
                var blobConn = Environment.GetEnvironmentVariable("BlobStorageConnectionString");
                if (string.IsNullOrWhiteSpace(blobConn)) return;

                var service = new BlobServiceClient(blobConn);
                var container = service.GetBlobContainerClient(CacheContainerName);
                await container.CreateIfNotExistsAsync();
                var blob = container.GetBlobClient(blobName);

                var json = JsonSerializer.Serialize(list);
                using var stream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

                await blob.UploadAsync(stream, overwrite: true);
                await blob.SetHttpHeadersAsync(new BlobHttpHeaders { ContentType = "application/json" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write {blobName} to blob cache", blobName);
            }
        }
    }
}
