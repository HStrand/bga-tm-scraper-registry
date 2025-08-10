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
    public static class GetAllPreludeStats
    {
        [FunctionName(nameof(GetAllPreludeStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "preludes/stats")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetAllPreludeStats function processed a request");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var cardStatsService = new CardStatsService(connectionString, log);
                var preludeStats = await cardStatsService.GetPreludeStatsAsync();

                log.LogInformation($"Returning {preludeStats.Count} prelude stats");
                return new OkObjectResult(preludeStats);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting prelude stats");
                return new StatusCodeResult(500);
            }
        }
    }
}
