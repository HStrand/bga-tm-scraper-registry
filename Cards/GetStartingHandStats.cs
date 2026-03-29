using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetStartingHandStats
    {
        [FunctionName(nameof(GetStartingHandStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "startinghands/stats")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetStartingHandStats function processed a request");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new StartingHandStatsService(connectionString, log);
                var stats = await service.GetAllStartingHandStatsAsync();

                log.LogInformation($"Returning {stats.Count} starting hand stats");
                return new OkObjectResult(stats);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting starting hand stats");
                return new StatusCodeResult(500);
            }
        }
    }
}
