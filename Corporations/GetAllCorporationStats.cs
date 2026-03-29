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
    public static class GetAllCorporationStats
    {
        [FunctionName(nameof(GetAllCorporationStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "corporations/playerstats")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetAllCorporationStats function processed a request");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new CorporationStatsService(connectionString, log);
                var rows = await service.GetAllCorporationPlayerStatsAsync();

                log.LogInformation($"Returning {rows.Count} corporation player stats rows");
                return new OkObjectResult(rows);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting all corporation player stats");
                return new StatusCodeResult(500);
            }
        }
    }
}
