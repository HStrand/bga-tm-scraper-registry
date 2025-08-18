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
    public static class GetPlayerMilestoneStats
    {
        [FunctionName(nameof(GetPlayerMilestoneStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetPlayerMilestoneStats function processed a request.");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var milestoneStatsService = new MilestoneStatsService(connectionString, log);

                // Get milestone statistics
                var stats = await milestoneStatsService.GetPlayerMilestoneStatsAsync();

                log.LogInformation($"Retrieved milestone statistics for {stats.Count} players");
                
                return new OkObjectResult(stats);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting player milestone statistics");
                return new StatusCodeResult(500);
            }
        }
    }
}
