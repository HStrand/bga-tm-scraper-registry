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
    public static class GetAllProjectCardOptionStats
    {
        [FunctionName(nameof(GetAllProjectCardOptionStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "cards/option-stats")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetAllProjectCardOptionStats function processed a request");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var cardStatsService = new CardStatsService(connectionString, log);
                var projectCardOptionStats = await cardStatsService.GetProjectCardOptionStatsAsync();

                log.LogInformation($"Returning {projectCardOptionStats.Count} project card option stats (excluding preludes)");
                return new OkObjectResult(projectCardOptionStats);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting project card option stats");
                return new StatusCodeResult(500);
            }
        }
    }
}
