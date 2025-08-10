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
    public static class GetAllProjectCardStats
    {
        [FunctionName(nameof(GetAllProjectCardStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "cards/stats")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetAllProjectCardStats function processed a request");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var cardStatsService = new CardStatsService(connectionString, log);
                var projectCardStats = await cardStatsService.GetProjectCardStatsAsync();

                log.LogInformation($"Returning {projectCardStats.Count} project card stats (excluding preludes)");
                return new OkObjectResult(projectCardStats);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting project card stats");
                return new StatusCodeResult(500);
            }
        }
    }
}
