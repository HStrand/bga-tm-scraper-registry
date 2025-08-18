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
    public static class GetPlayerGreeneryStats
    {
        [FunctionName(nameof(GetPlayerGreeneryStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetPlayerGreeneryStats function processed a request.");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var greeneryStatsService = new GreeneryStatsService(connectionString, log);

                // Get greenery statistics
                var stats = await greeneryStatsService.GetPlayerGreeneryStatsAsync();

                log.LogInformation($"Retrieved greenery statistics for {stats.Count} players");
                
                return new OkObjectResult(stats);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting player greenery statistics");
                return new StatusCodeResult(500);
            }
        }
    }
}
