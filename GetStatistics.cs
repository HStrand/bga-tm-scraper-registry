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
    public static class GetStatistics
    {
        private static readonly MemoryCache _cache = new MemoryCache(new MemoryCacheOptions
        {
            SizeLimit = 100 // Limit cache to 100 entries
        });

        [FunctionName(nameof(GetStatistics))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetStatistics function processed a request.");

            try
            {
                // Get email from query parameter
                string email = req.Query["email"];
                
                if (string.IsNullOrEmpty(email))
                {
                    log.LogError("Email parameter is required");
                    return new BadRequestObjectResult(new { message = "Email parameter is required" });
                }

                // Create cache key based on email
                var cacheKey = $"statistics_{email}";

                // Try to get from cache first
                if (_cache.TryGetValue(cacheKey, out var cachedStatistics))
                {
                    log.LogInformation($"Statistics served from cache for {email}");
                    return new OkObjectResult(cachedStatistics);
                }

                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var gameService = new GameDatabaseService(connectionString, log);

                // Get statistics from database
                var statistics = await gameService.GetStatisticsAsync(email);

                // Cache the result with 5-minute expiry
                var cacheOptions = new MemoryCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5),
                    Size = 1 // Each entry counts as 1 towards the size limit
                };

                _cache.Set(cacheKey, statistics, cacheOptions);

                log.LogInformation($"Statistics requested by {email}: {statistics.TotalIndexedGames} total indexed games, {statistics.ScrapedGamesTotal} scraped games, {statistics.ScrapedGamesByUser} scraped by user (cached for 5 minutes)");
                
                return new OkObjectResult(statistics);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting statistics");
                return new StatusCodeResult(500);
            }
        }
    }
}
