using System;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetCorporationFilterOptions
    {
        [FunctionName(nameof(GetCorporationFilterOptions))]
        public static async System.Threading.Tasks.Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "corporations/options")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetCorporationFilterOptions function processed a request");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new CorporationStatsService(connectionString, log);
                var options = await service.GetCorporationFilterOptionsAsync();

                return new OkObjectResult(options);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting corporation filter options");
                return new StatusCodeResult(500);
            }
        }
    }
}
