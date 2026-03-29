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
    public static class GetAllMilestoneStats
    {
        [FunctionName(nameof(GetAllMilestoneStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "milestones/stats")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetAllMilestoneStats function processed a request");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new MilestoneStatsService(connectionString, log);
                var rows = await service.GetAllMilestoneClaimRowsAsync();

                log.LogInformation($"Returning {rows.Count} milestone claim rows (detailed)");
                return new OkObjectResult(rows);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting all milestone stats");
                return new StatusCodeResult(500);
            }
        }
    }
}
