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
    public static class GetCombinationCombos
    {
        private static readonly string[] ValidTypes = { "corp-prelude", "corp-card", "prelude-prelude", "prelude-card", "card-card" };

        [FunctionName(nameof(GetCombinationCombos))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "combinations/combos/{type}")] HttpRequest req,
            string type,
            ILogger log)
        {
            log.LogInformation("GetCombinationCombos function processed a request for type: {type}", type);

            if (Array.IndexOf(ValidTypes, type) < 0)
            {
                return new BadRequestObjectResult($"Invalid combo type: {type}. Valid types: {string.Join(", ", ValidTypes)}");
            }

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new CombinationStatsService(connectionString, log);
                var combos = await service.GetCombosAsync(type);

                log.LogInformation("Returning {count} combos for type {type}", combos.Count, type);
                return new OkObjectResult(combos);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting combination combos for type: {type}", type);
                return new StatusCodeResult(500);
            }
        }
    }
}
