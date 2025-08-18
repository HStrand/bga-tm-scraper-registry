using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry
{
    public static class GetPlayerAwardStats
    {
        [FunctionName(nameof(GetPlayerAwardStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetPlayerAwardStats function processed a request.");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var playerAwardStatsService = new PlayerAwardStatsService(connectionString, log);

                // Get player award statistics
                var stats = await playerAwardStatsService.GetPlayerAwardStatsAsync();

                log.LogInformation($"Retrieved award statistics for {stats.Count} players");
                
                return new OkObjectResult(stats);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting player award statistics");
                return new StatusCodeResult(500);
            }
        }
    }
}
