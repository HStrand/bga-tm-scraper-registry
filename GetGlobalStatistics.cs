using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Caching.Memory;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry
{
    public static class GetGlobalStatistics
    {
        private static readonly MemoryCache _cache = new MemoryCache(new MemoryCacheOptions
        {
            SizeLimit = 100 // Limit cache to 100 entries
        });

        [FunctionName(nameof(GetGlobalStatistics))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetGlobalStatistics function processed a request.");

            try
            {
                // Create cache key for global statistics
                var cacheKey = "global_statistics";

                // Try to get from cache first
                if (_cache.TryGetValue(cacheKey, out var cachedStatistics))
                {
                    log.LogInformation("Global statistics served from cache");
                    return new OkObjectResult(cachedStatistics);
                }

                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var gameService = new GameDatabaseService(connectionString, log);

                // Get global statistics from database
                var statistics = await gameService.GetGlobalStatisticsAsync();

                // Cache the result with 5-minute expiry
                var cacheOptions = new MemoryCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5),
                    Size = 1 // Each entry counts as 1 towards the size limit
                };

                _cache.Set(cacheKey, statistics, cacheOptions);

                log.LogInformation($"Global statistics retrieved: {statistics.TotalIndexedGames} total indexed games, {statistics.ScrapedGamesTotal} scraped games, {statistics.TotalPlayers} total players (cached for 5 minutes)");
                
                return new OkObjectResult(statistics);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting global statistics");
                return new StatusCodeResult(500);
            }
        }
    }
}
