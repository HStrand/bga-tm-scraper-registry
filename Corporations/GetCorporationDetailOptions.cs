using System;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetCorporationDetailOptions
    {
        [FunctionName(nameof(GetCorporationDetailOptions))]
        public static async System.Threading.Tasks.Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "corporations/{corporation}/options")] HttpRequest req,
            string corporation,
            ILogger log)
        {
            corporation = corporation?.Replace("_", " ");
            log.LogInformation("GetCorporationDetailOptions for {corp}", corporation);

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                if (string.IsNullOrWhiteSpace(corporation))
                {
                    return new BadRequestObjectResult("Corporation parameter is required");
                }

                var service = new CorporationStatsService(connectionString, log);
                var options = await service.GetCorporationDetailOptionsAsync(corporation);

                return new OkObjectResult(options);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting corporation detail options for {corp}", corporation);
                return new StatusCodeResult(500);
            }
        }
    }
}
