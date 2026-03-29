using System;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetAwardsFilterOptions
    {
        [FunctionName(nameof(GetAwardsFilterOptions))]
        public static async System.Threading.Tasks.Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "awards/options")] HttpRequest req,
            ILogger log)
        {
            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new AwardStatsService(connectionString, log);
                var options = await service.GetAwardsFilterOptionsAsync();
                return new OkObjectResult(options);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting awards filter options");
                return new StatusCodeResult(500);
            }
        }
    }
}
