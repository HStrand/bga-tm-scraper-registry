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
    public static class GetCombinationBaselines
    {
        [FunctionName(nameof(GetCombinationBaselines))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "combinations/baselines")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetCombinationBaselines function processed a request");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new CombinationStatsService(connectionString, log);

                var cards = await service.GetCardBaselinesAsync();
                var corporations = await service.GetCorpBaselinesAsync();
                var preludes = await service.GetPreludeBaselinesAsync();

                return new OkObjectResult(new
                {
                    cards,
                    corporations,
                    preludes
                });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting combination baselines");
                return new StatusCodeResult(500);
            }
        }
    }
}
